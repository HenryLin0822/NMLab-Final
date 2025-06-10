#!/usr/bin/env python3
"""
Face Recognition Service for Exam Monitoring System
Receives base64 image frames via HTTP and verifies student identity against reference photos
"""

import cv2
import face_recognition
import numpy as np
import base64
import json
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import logging
from datetime import datetime
import io
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FaceRecognitionService:
    def __init__(self):
        # Statistics tracking
        self.stats_lock = threading.Lock()
        self.stats = {
            'frames_processed': 0,
            'errors': 0,
            'successful_verifications': 0,
            'failed_verifications': 0,
            'no_face_detections': 0,
            'students_registered': 0,
            'start_time': datetime.now(),
            'last_analysis': None
        }
        
        # Student reference data storage (in-memory during session)
        self.students_lock = threading.Lock()
        self.student_references = {}  # {studentId: encoding}
        self.student_names = {}       # {studentId: name}
        
        # Recognition settings
        self.recognition_threshold = 0.45  # Maximum distance for match
        self.high_confidence_threshold = 0.4  # High confidence match
        
        # Flask app setup
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_routes()
        
        # ===== CPU Memory Optimization =====
        import gc
        cv2.setNumThreads(1)  # Limit OpenCV threads
        gc.collect()
        logger.info("Face Recognition Service initialized with CPU optimization")
        # ===== Optimization End =====
        
        logger.info("Face Recognition Service initialized successfully")
    
    def update_stats(self, **kwargs):
        """Thread-safe stats update"""
        with self.stats_lock:
            for key, value in kwargs.items():
                if key in self.stats:
                    if key in ['frames_processed', 'errors', 'successful_verifications', 
                              'failed_verifications', 'no_face_detections', 'students_registered']:
                        self.stats[key] += value
                    else:
                        self.stats[key] = value
    
    def setup_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            with self.stats_lock:
                students_count = len(self.student_references)
            
            return jsonify({
                'status': 'healthy',
                'service': 'face-recognition',
                'students_registered': students_count,
                'timestamp': datetime.now().isoformat()
            })
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            """Get service statistics"""
            with self.stats_lock:
                uptime = datetime.now() - self.stats['start_time']
                stats_copy = self.stats.copy()
            
            with self.students_lock:
                stats_copy['students_registered'] = len(self.student_references)
            
            stats_copy['uptime_seconds'] = int(uptime.total_seconds())
            stats_copy['status'] = 'running'
            
            return jsonify(stats_copy)
        
        @self.app.route('/register', methods=['POST'])
        def register_student():
            """Register a student's reference photo"""
            try:
                data = request.get_json()
                if not data:
                    return jsonify({'error': 'No JSON data provided'}), 400
                
                student_id = data.get('studentId')
                student_name = data.get('studentName', f'Student {student_id}')
                reference_image = data.get('referenceImage')
                
                if not student_id or not reference_image:
                    return jsonify({'error': 'Missing studentId or referenceImage'}), 400
                
                # Process the reference image
                result = self.register_student_reference(student_id, student_name, reference_image)
                
                if result['success']:
                    self.update_stats(students_registered=1)
                else:
                    self.update_stats(errors=1)
                
                return jsonify(result)
                
            except Exception as e:
                logger.error(f"Error in register_student: {str(e)}")
                self.update_stats(errors=1)
                return jsonify({'error': f'Registration failed: {str(e)}'}), 500
        
        @self.app.route('/analyze', methods=['POST'])
        def analyze_frame():
            """Main endpoint to analyze face verification in a frame"""
            try:
                data = request.get_json()
                if not data:
                    return jsonify({'error': 'No JSON data provided'}), 400
                
                student_id = data.get('studentId')
                frame_data = data.get('frameData')
                
                if not student_id or not frame_data:
                    return jsonify({'error': 'Missing studentId or frameData'}), 400
                
                # Check if student is registered
                with self.students_lock:
                    if student_id not in self.student_references:
                        return jsonify({
                            'success': True,
                            'face_verification': 'not_registered',
                            'verification_text': 'Student not registered',
                            'confidence': 0.0,
                            'face_detected': False,
                            'studentId': student_id,
                            'timestamp': datetime.now().isoformat()
                        })
                
                # Analyze the frame
                result = self.analyze_face_from_base64(student_id, frame_data)
                
                # Update stats
                self.update_stats(frames_processed=1)
                with self.stats_lock:
                    self.stats['last_analysis'] = datetime.now().isoformat()
                
                if result.get('success'):
                    verification = result.get('face_verification', 'unknown')
                    if verification == 'match':
                        self.update_stats(successful_verifications=1)
                    elif verification == 'no_match':
                        self.update_stats(failed_verifications=1)
                    elif not result.get('face_detected'):
                        self.update_stats(no_face_detections=1)
                
                return jsonify(result)
                
            except Exception as e:
                logger.error(f"Error in analyze_frame: {str(e)}")
                self.update_stats(errors=1)
                return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
    
    def register_student_reference(self, student_id, student_name, reference_image):
        """Register a student's reference photo for verification"""
        face_encodings = None  # initialize early
        try:
            # Handle data URL format (data:image/jpeg;base64,...)
            if 'base64,' in reference_image:
                reference_image = reference_image.split('base64,')[1]

            # Decode base64 to bytes
            image_bytes = base64.b64decode(reference_image)

            # Convert to PIL Image
            pil_image = Image.open(io.BytesIO(image_bytes))

            # Convert PIL to OpenCV format (RGB to BGR)
            opencv_frame = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

            # Convert to RGB for face_recognition library
            rgb_image = cv2.cvtColor(opencv_frame, cv2.COLOR_BGR2RGB)

            # Find face locations and encodings
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
            face_encodings = face_recognition.face_encodings(rgb_image, face_locations)

            if not face_encodings:
                return {
                    'success': False,
                    'error': 'No face found in reference image',
                    'face_detected': False
                }

            if len(face_encodings) > 1:
                logger.warning(f"Multiple faces found in reference for student {student_id}, using first one")

            # Use the first face encoding
            face_encoding = face_encodings[0]

            # Store reference data
            with self.students_lock:
                self.student_references[student_id] = face_encoding
                self.student_names[student_id] = student_name

            logger.info(f"Student {student_id} ({student_name}) registered successfully")

            # Memory cleanup
            import gc
            del image_bytes, pil_image, opencv_frame, rgb_image, face_locations, face_encodings
            gc.collect()

            return {
                'success': True,
                'message': f'Student {student_name} registered successfully',
                'face_detected': True,
                'face_count': 1,  # guaranteed to be 1 if we get here
                'studentId': student_id,
                'studentName': student_name,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error registering student {student_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'face_detected': False
            }


            
        except Exception as e:
            logger.error(f"Error registering student {student_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'face_detected': False
            }
    
    def analyze_face_from_base64(self, student_id, frame_data):
        """Convert base64 image to OpenCV frame and analyze face verification"""
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
            
            # Analyze face verification using the frame
            verification_result = self.analyze_opencv_frame(opencv_frame, student_id)
            
            # Add metadata
            verification_result['studentId'] = student_id
            verification_result['timestamp'] = datetime.now().isoformat()
            verification_result['frame_size'] = {
                'width': opencv_frame.shape[1],
                'height': opencv_frame.shape[0]
            }
            
            # Memory cleanup
            import gc
            del image_bytes, pil_image, opencv_frame
            gc.collect()
            
            return verification_result
            
        except Exception as e:
            logger.error(f"Error processing frame for student {student_id}: {str(e)}")
            raise e
    
    def analyze_opencv_frame(self, frame, student_id):
        """Analyze face verification using face_recognition library"""
        try:
            # Convert to RGB for face_recognition library
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Find face locations and encodings
            face_locations = face_recognition.face_locations(rgb_frame, model="hog")
            face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            
            if len(face_encodings) == 0:
                return {
                    'success': True,
                    'face_verification': 'no_face',
                    'verification_text': 'No face detected in frame',
                    'confidence': 0.0,
                    'face_detected': False,
                    'face_coordinates': None
                }
            
            # Get student's reference encoding
            with self.students_lock:
                reference_encoding = self.student_references.get(student_id)
                student_name = self.student_names.get(student_id, f'Student {student_id}')
            
            if reference_encoding is None:
                return {
                    'success': True,
                    'face_verification': 'not_registered',
                    'verification_text': 'Student not registered',
                    'confidence': 0.0,
                    'face_detected': True,
                    'face_coordinates': None
                }
            
            # Take the first (largest) face for comparison
            current_encoding = face_encodings[0]
            (top, right, bottom, left) = face_locations[0]
            
            # Calculate face distance (lower is better match)
            face_distance = face_recognition.face_distance([reference_encoding], current_encoding)[0]
            confidence = 1 - face_distance  # Convert distance to confidence
            
            # Determine verification result
            if face_distance <= self.high_confidence_threshold:
                verification = 'match'
                verification_text = f'Identity verified (High confidence)'
            elif face_distance <= self.recognition_threshold:
                verification = 'match'
                verification_text = f'Identity verified (Medium confidence)'
            else:
                verification = 'no_match'
                verification_text = f'Identity not verified'
            
            logger.info(f"Student {student_id}: {verification} (distance: {face_distance:.3f}, confidence: {confidence:.3f})")
            
            # Memory cleanup
            import gc
            del rgb_frame, face_locations, face_encodings, current_encoding
            gc.collect()
            
            return {
                'success': True,
                'face_verification': verification,
                'verification_text': verification_text,
                'confidence': float(confidence),
                'face_distance': float(face_distance),
                'face_detected': True,
                'face_coordinates': {
                    'x': int(left),
                    'y': int(top),
                    'width': int(right - left),
                    'height': int(bottom - top)
                },
                'student_name': student_name
            }
            
        except Exception as e:
            logger.error(f"Error analyzing frame for student {student_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'face_verification': 'error',
                'verification_text': 'Analysis failed',
                'confidence': 0.0,
                'face_detected': False
            }
    
    def get_student_list(self):
        """Get list of registered students"""
        with self.students_lock:
            return {
                'students': [
                    {
                        'studentId': student_id,
                        'studentName': self.student_names.get(student_id, f'Student {student_id}')
                    }
                    for student_id in self.student_references.keys()
                ],
                'total_registered': len(self.student_references)
            }
    
    def clear_student_data(self, student_id=None):
        """Clear student reference data (for cleanup)"""
        with self.students_lock:
            if student_id:
                # Clear specific student
                if student_id in self.student_references:
                    del self.student_references[student_id]
                    del self.student_names[student_id]
                    logger.info(f"Cleared data for student {student_id}")
            else:
                # Clear all students
                count = len(self.student_references)
                self.student_references.clear()
                self.student_names.clear()
                logger.info(f"Cleared data for {count} students")
    
    def run(self, host='localhost', port=5002, debug=False):
        """Start the Flask server"""
        logger.info(f"Starting Face Recognition Service on {host}:{port}")
        logger.info(f"Recognition threshold: {self.recognition_threshold}")
        logger.info(f"High confidence threshold: {self.high_confidence_threshold}")
        self.app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    # Create and run the service
    try:
        service = FaceRecognitionService()
        # Run on all interfaces so Node.js can access it
        service.run(host='0.0.0.0', port=5002, debug=False)
    except Exception as e:
        logger.error(f"Failed to start Face Recognition Service: {str(e)}")
        exit(1)