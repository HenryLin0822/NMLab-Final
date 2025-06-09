#!/usr/bin/env python3
"""
Thread-Safe Gaze Tracking Service for Exam Monitoring System
Handles multiple concurrent users without segmentation faults
"""

import cv2
import numpy as np
import base64
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from gaze_tracking import GazeTracking
import logging
from datetime import datetime
import io
from PIL import Image
import sys
import traceback
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import queue
import multiprocessing

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ThreadSafeGazeService:
    def __init__(self, max_workers=2):
        """
        Initialize with limited concurrent workers to prevent resource conflicts
        max_workers: Maximum number of concurrent gaze analysis operations
        """
        self.max_workers = max_workers
        
        # Thread-safe queue for managing gaze tracker instances
        self.gaze_pool = queue.Queue(maxsize=max_workers)
        self.pool_lock = threading.Lock()
        
        # Initialize pool of gaze trackers
        self._initialize_gaze_pool()
        
        # Thread pool executor for handling requests
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="GazeWorker")
        
        # Statistics tracking (thread-safe)
        self.stats_lock = threading.Lock()
        self.stats = {
            'frames_processed': 0,
            'errors': 0,
            'corrupted_frames': 0,
            'concurrent_requests': 0,
            'max_concurrent': 0,
            'start_time': datetime.now(),
            'last_analysis': None
        }
        
        # Flask app setup
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_routes()
        
        # ===== CPU 記憶體優化 =====
        import gc
        cv2.setNumThreads(1)  # Reduced to 1 for better stability
        gc.collect()
        logger.info(f"CPU memory optimization enabled with {max_workers} workers")
        # ===== 優化結束 =====
        
        logger.info(f"Thread-Safe Gaze Analysis Service initialized with {max_workers} workers")
    
    def _initialize_gaze_pool(self):
        """Initialize a pool of GazeTracking instances"""
        for i in range(self.max_workers):
            try:
                gaze_tracker = GazeTracking()
                self.gaze_pool.put(gaze_tracker)
                logger.info(f"Initialized gaze tracker {i+1}/{self.max_workers}")
            except Exception as e:
                logger.error(f"Failed to initialize gaze tracker {i+1}: {str(e)}")
                raise e
    
    def get_gaze_tracker(self, timeout=30):
        """Get a gaze tracker from the pool (thread-safe)"""
        try:
            return self.gaze_pool.get(timeout=timeout)
        except queue.Empty:
            raise TimeoutError("No gaze tracker available - service overloaded")
    
    def return_gaze_tracker(self, gaze_tracker):
        """Return a gaze tracker to the pool (thread-safe)"""
        try:
            self.gaze_pool.put_nowait(gaze_tracker)
        except queue.Full:
            logger.warning("Gaze tracker pool full - tracker discarded")
    
    def update_stats(self, **kwargs):
        """Thread-safe stats update"""
        with self.stats_lock:
            for key, value in kwargs.items():
                if key in self.stats:
                    if key in ['frames_processed', 'errors', 'corrupted_frames']:
                        self.stats[key] += value
                    else:
                        self.stats[key] = value
    
    def validate_base64_image(self, frame_data):
        """Validate base64 image data before processing"""
        try:
            if not frame_data or len(frame_data) < 100:
                return False, "Frame data too short"
            
            if 'base64,' in frame_data:
                frame_data = frame_data.split('base64,')[1]
            
            if len(frame_data) % 4 != 0:
                frame_data += '=' * (4 - len(frame_data) % 4)
            
            image_bytes = base64.b64decode(frame_data, validate=True)
            
            if len(image_bytes) < 1000:
                return False, "Image data too small"
            
            return True, frame_data
            
        except Exception as e:
            return False, f"Base64 validation failed: {str(e)}"
    
    def setup_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            with self.stats_lock:
                available_workers = self.gaze_pool.qsize()
            
            return jsonify({
                'status': 'healthy',
                'service': 'thread-safe-gaze-tracking',
                'available_workers': available_workers,
                'max_workers': self.max_workers,
                'timestamp': datetime.now().isoformat()
            })
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            """Get service statistics"""
            with self.stats_lock:
                uptime = datetime.now() - self.stats['start_time']
                stats_copy = self.stats.copy()
            
            stats_copy['uptime_seconds'] = int(uptime.total_seconds())
            stats_copy['available_workers'] = self.gaze_pool.qsize()
            stats_copy['status'] = 'running'
            
            return jsonify(stats_copy)
        
        @self.app.route('/analyze', methods=['POST'])
        def analyze_frame():
            """Main endpoint to analyze gaze in a frame"""
            # Track concurrent requests
            with self.stats_lock:
                self.stats['concurrent_requests'] += 1
                if self.stats['concurrent_requests'] > self.stats['max_concurrent']:
                    self.stats['max_concurrent'] = self.stats['concurrent_requests']
            
            try:
                # Request size limit
                if request.content_length and request.content_length > 10 * 1024 * 1024:  # 10MB limit
                    return jsonify({'error': 'Request too large'}), 413
                
                data = request.get_json(force=True)
                if not data:
                    return jsonify({'error': 'No JSON data provided'}), 400
                
                student_id = data.get('studentId')
                frame_data = data.get('frameData')
                
                if not student_id or not frame_data:
                    return jsonify({'error': 'Missing studentId or frameData'}), 400
                
                # Validate frame data
                is_valid, validated_data_or_error = self.validate_base64_image(frame_data)
                if not is_valid:
                    self.update_stats(corrupted_frames=1)
                    return jsonify({
                        'error': f'Invalid frame data: {validated_data_or_error}',
                        'success': False,
                        'gaze_direction': 'error'
                    }), 400
                
                # Submit to thread pool for processing
                future = self.executor.submit(
                    self.analyze_gaze_from_base64_threadsafe, 
                    student_id, 
                    validated_data_or_error
                )
                
                # Wait for result with timeout
                try:
                    result = future.result(timeout=30)  # 30 second timeout
                except TimeoutError:
                    return jsonify({
                        'error': 'Analysis timeout - service overloaded',
                        'success': False,
                        'gaze_direction': 'timeout'
                    }), 503
                
                self.update_stats(frames_processed=1)
                with self.stats_lock:
                    self.stats['last_analysis'] = datetime.now().isoformat()
                
                return jsonify(result)
                
            except Exception as e:
                logger.error(f"Error in analyze_frame: {str(e)}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                self.update_stats(errors=1)
                return jsonify({
                    'error': f'Analysis failed: {str(e)}',
                    'success': False,
                    'gaze_direction': 'error'
                }), 500
            finally:
                # Decrease concurrent request count
                with self.stats_lock:
                    self.stats['concurrent_requests'] -= 1
    
    def analyze_gaze_from_base64_threadsafe(self, student_id, frame_data):
        """Thread-safe version of gaze analysis"""
        gaze_tracker = None
        image_bytes = None
        pil_image = None
        opencv_frame = None
        
        try:
            # Get a gaze tracker from the pool
            gaze_tracker = self.get_gaze_tracker(timeout=10)
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(frame_data)
            
            if len(image_bytes) < 1000:
                raise ValueError("Decoded image too small")
            
            # Convert to PIL Image with error handling
            try:
                pil_image = Image.open(io.BytesIO(image_bytes))
                pil_image.verify()
                pil_image = Image.open(io.BytesIO(image_bytes))
            except Exception as e:
                raise ValueError(f"Invalid image format: {str(e)}")
            
            # Convert to RGB if needed
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Check image dimensions
            width, height = pil_image.size
            if width < 50 or height < 50:
                raise ValueError("Image too small for analysis")
            
            # Convert PIL to OpenCV format
            opencv_frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            
            if opencv_frame is None or opencv_frame.size == 0:
                raise ValueError("Failed to convert to OpenCV format")
            
            # Analyze gaze using the dedicated tracker
            gaze_result = self.analyze_opencv_frame_threadsafe(opencv_frame, gaze_tracker)
            
            # Add metadata
            gaze_result['studentId'] = student_id
            gaze_result['timestamp'] = datetime.now().isoformat()
            gaze_result['frame_size'] = {
                'width': int(opencv_frame.shape[1]),
                'height': int(opencv_frame.shape[0])
            }
            
            return gaze_result
            
        except Exception as e:
            logger.error(f"Error processing frame for student {student_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'gaze_direction': 'error',
                'gaze_text': 'Frame processing failed',
                'confidence': 0.0,
                'studentId': student_id,
                'timestamp': datetime.now().isoformat()
            }
        finally:
            # Always return the gaze tracker to the pool
            if gaze_tracker is not None:
                self.return_gaze_tracker(gaze_tracker)
            
            # Memory cleanup
            import gc
            try:
                if image_bytes is not None:
                    del image_bytes
                if pil_image is not None:
                    del pil_image
                if opencv_frame is not None:
                    del opencv_frame
                gc.collect()
            except:
                pass
    
    def analyze_opencv_frame_threadsafe(self, frame, gaze_tracker):
        """Thread-safe gaze analysis using dedicated tracker"""
        try:
            # Validate frame
            if frame is None or frame.size == 0:
                raise ValueError("Invalid frame for analysis")
            
            if len(frame.shape) != 3 or frame.shape[2] != 3:
                raise ValueError("Frame must be 3-channel BGR image")
            
            # Use the dedicated gaze tracker (thread-safe since each thread has its own)
            try:
                gaze_tracker.refresh(frame)
            except Exception as e:
                logger.error(f"Gaze refresh failed: {str(e)}")
                raise ValueError(f"Gaze tracking failed: {str(e)}")
            
            # Determine gaze direction
            gaze_direction = "unknown"
            gaze_text = ""
            
            try:
                if gaze_tracker.is_blinking():
                    gaze_direction = "blinking"
                    gaze_text = "Blinking"
                elif gaze_tracker.is_right():
                    gaze_direction = "right"
                    gaze_text = "Looking right"
                elif gaze_tracker.is_left():
                    gaze_direction = "left"
                    gaze_text = "Looking left"
                elif gaze_tracker.is_center():
                    gaze_direction = "center"
                    gaze_text = "Looking center"
                else:
                    gaze_direction = "unknown"
                    gaze_text = "Cannot detect gaze"
            except Exception as e:
                logger.warning(f"Gaze direction detection failed: {str(e)}")
                gaze_direction = "error"
                gaze_text = "Detection error"
            
            # Get pupil coordinates
            left_pupil = None
            right_pupil = None
            
            try:
                left_pupil = gaze_tracker.pupil_left_coords()
                right_pupil = gaze_tracker.pupil_right_coords()
                
                if left_pupil is not None:
                    left_pupil = [float(x) for x in left_pupil] if hasattr(left_pupil, '__iter__') else None
                if right_pupil is not None:
                    right_pupil = [float(x) for x in right_pupil] if hasattr(right_pupil, '__iter__') else None
            except Exception as e:
                logger.warning(f"Pupil coordinate extraction failed: {str(e)}")
            
            # Calculate confidence
            confidence = 0.0
            if left_pupil is not None and right_pupil is not None:
                confidence = 1.0
            elif left_pupil is not None or right_pupil is not None:
                confidence = 0.5
            
            # Get ratios
            horizontal_ratio = None
            vertical_ratio = None
            
            try:
                horizontal_ratio = gaze_tracker.horizontal_ratio()
                vertical_ratio = gaze_tracker.vertical_ratio()
                
                if horizontal_ratio is not None:
                    horizontal_ratio = float(horizontal_ratio)
                if vertical_ratio is not None:
                    vertical_ratio = float(vertical_ratio)
            except Exception as e:
                logger.warning(f"Ratio calculation failed: {str(e)}")
            
            return {
                'success': True,
                'gaze_direction': gaze_direction,
                'gaze_text': gaze_text,
                'confidence': float(confidence),
                'pupils': {
                    'left': left_pupil,
                    'right': right_pupil
                },
                'ratios': {
                    'horizontal': horizontal_ratio,
                    'vertical': vertical_ratio
                },
                'face_detected': left_pupil is not None or right_pupil is not None
            }
            
        except Exception as e:
            logger.error(f"Error analyzing frame: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'gaze_direction': 'error',
                'gaze_text': 'Analysis failed',
                'confidence': 0.0
            }
    
    def run(self, host='localhost', port=5000, debug=False):
        """Start the Flask server"""
        logger.info(f"Starting Thread-Safe Gaze Analysis Service on {host}:{port}")
        # Use threaded=True for Flask to handle multiple requests
        self.app.run(host=host, port=port, debug=debug, threaded=True)
    
    def shutdown(self):
        """Clean shutdown of the service"""
        logger.info("Shutting down Thread-Safe Gaze Service...")
        self.executor.shutdown(wait=True)

if __name__ == '__main__':
    # Determine optimal number of workers based on CPU cores
    max_workers = min(4, max(1, multiprocessing.cpu_count() // 2))
    
    try:
        service = ThreadSafeGazeService(max_workers=max_workers)
        service.run(host='0.0.0.0', port=5000, debug=False)
    except KeyboardInterrupt:
        logger.info("Service interrupted by user")
        service.shutdown()
    except Exception as e:
        logger.error(f"Failed to start Thread-Safe Gaze Service: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        sys.exit(1)