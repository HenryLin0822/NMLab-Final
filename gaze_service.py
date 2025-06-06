#!/usr/bin/env python3
"""
Gaze Tracking Service for Exam Monitoring System
Receives base64 image frames via HTTP and analyzes gaze direction using gaze_tracking library
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GazeAnalysisService:
    def __init__(self):
        # Initialize gaze tracker
        self.gaze = GazeTracking()
        
        # Statistics tracking
        self.stats = {
            'frames_processed': 0,
            'errors': 0,
            'start_time': datetime.now(),
            'last_analysis': None
        }
        
        # Flask app setup
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_routes()
        
        logger.info("Gaze Analysis Service initialized")
    
    def setup_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'service': 'gaze-tracking',
                'timestamp': datetime.now().isoformat()
            })
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            """Get service statistics"""
            uptime = datetime.now() - self.stats['start_time']
            return jsonify({
                'frames_processed': self.stats['frames_processed'],
                'errors': self.stats['errors'],
                'uptime_seconds': int(uptime.total_seconds()),
                'last_analysis': self.stats['last_analysis'],
                'status': 'running'
            })
        
        @self.app.route('/analyze', methods=['POST'])
        def analyze_frame():
            """Main endpoint to analyze gaze in a frame"""
            try:
                # Get JSON data
                data = request.get_json()
                if not data:
                    return jsonify({'error': 'No JSON data provided'}), 400
                
                # Extract required fields
                student_id = data.get('studentId')
                frame_data = data.get('frameData')
                
                if not student_id or not frame_data:
                    return jsonify({'error': 'Missing studentId or frameData'}), 400
                
                # Analyze the frame
                result = self.analyze_gaze_from_base64(student_id, frame_data)
                
                # Update stats
                self.stats['frames_processed'] += 1
                self.stats['last_analysis'] = datetime.now().isoformat()
                
                return jsonify(result)
                
            except Exception as e:
                logger.error(f"Error in analyze_frame: {str(e)}")
                self.stats['errors'] += 1
                return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
    
    def analyze_gaze_from_base64(self, student_id, frame_data):
        """Convert base64 image to OpenCV frame and analyze gaze"""
        try:
            # Handle data URL format (data:image/jpeg;base64,...)
            if 'base64,' in frame_data:
                frame_data = frame_data.split('base64,')[1]
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(frame_data)
            
            # Convert to PIL Image
            pil_image = Image.open(io.BytesIO(image_bytes))
            
            # Convert PIL to OpenCV format (RGB to BGR)
            opencv_frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            
            # Analyze gaze using the frame
            gaze_result = self.analyze_opencv_frame(opencv_frame)
            
            # Add metadata
            gaze_result['studentId'] = student_id
            gaze_result['timestamp'] = datetime.now().isoformat()
            gaze_result['frame_size'] = {
                'width': opencv_frame.shape[1],
                'height': opencv_frame.shape[0]
            }
            
            return gaze_result
            
        except Exception as e:
            logger.error(f"Error processing frame for student {student_id}: {str(e)}")
            raise e
    
    def analyze_opencv_frame(self, frame):
        """Analyze gaze direction using gaze_tracking library"""
        try:
            # Send frame to gaze tracker for analysis
            self.gaze.refresh(frame)
            
            # Determine gaze direction using library methods
            gaze_direction = "unknown"
            gaze_text = ""
            
            if self.gaze.is_blinking():
                gaze_direction = "blinking"
                gaze_text = "Blinking"
            elif self.gaze.is_right():
                gaze_direction = "right"
                gaze_text = "Looking right"
            elif self.gaze.is_left():
                gaze_direction = "left"
                gaze_text = "Looking left"
            elif self.gaze.is_center():
                gaze_direction = "center"
                gaze_text = "Looking center"
            else:
                gaze_direction = "unknown"
                gaze_text = "Cannot detect gaze"
            
            # Get pupil coordinates and convert to JSON-serializable format
            left_pupil = self.gaze.pupil_left_coords()
            right_pupil = self.gaze.pupil_right_coords()
            
            # Convert numpy arrays/tuples to lists for JSON serialization
            if left_pupil is not None:
                left_pupil = [float(x) for x in left_pupil] if hasattr(left_pupil, '__iter__') else None
            if right_pupil is not None:
                right_pupil = [float(x) for x in right_pupil] if hasattr(right_pupil, '__iter__') else None
            
            # Calculate confidence based on pupil detection
            confidence = 0.0
            if left_pupil is not None and right_pupil is not None:
                confidence = 1.0
            elif left_pupil is not None or right_pupil is not None:
                confidence = 0.5
            
            # Get horizontal ratio for additional analysis and convert to float
            horizontal_ratio = self.gaze.horizontal_ratio()
            vertical_ratio = self.gaze.vertical_ratio()
            
            # Convert to Python native types for JSON serialization
            if horizontal_ratio is not None:
                horizontal_ratio = float(horizontal_ratio)
            if vertical_ratio is not None:
                vertical_ratio = float(vertical_ratio)
            
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
        logger.info(f"Starting Gaze Analysis Service on {host}:{port}")
        self.app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    # Create and run the service
    service = GazeAnalysisService()
    
    # Run on all interfaces so Node.js can access it
    service.run(host='0.0.0.0', port=5000, debug=False)