#!/usr/bin/env python3
"""
AI Detection Service for Exam Monitoring System
Receives base64 image frames via HTTP and analyzes whether the face is AI-generated
"""

import cv2
import torch
import numpy as np
import base64
import json
import glob
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import logging
from datetime import datetime
import io

# Import your custom modules
from src.model import get_model
from src.custom_dataset import get_transform

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIDetectionService:
    def __init__(self, weights_folder='./models'):
        # Initialize device
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")
        
        # Initialize model
        self.model = get_model(self.device)
        self.weights_folder = weights_folder
        self.model = self.load_latest_model()
        self.transform = get_transform()
        
        # Initialize face cascade
        self.face_cascade = cv2.CascadeClassifier("haarcascade_frontalface_default.xml")
        if self.face_cascade.empty():
            # Try alternative path
            cascade_path = "src/haarcascade_frontalface_default.xml"
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
            if self.face_cascade.empty():
                raise FileNotFoundError("haarcascade_frontalface_default.xml not found")
        
        # Label mapping
        self.label_map = {0: "real", 1: "fake"}
        
        # Statistics tracking
        self.stats = {
            'frames_processed': 0,
            'errors': 0,
            'real_detections': 0,
            'fake_detections': 0,
            'no_face_detections': 0,
            'start_time': datetime.now(),
            'last_analysis': None
        }
        
        # Flask app setup
        self.app = Flask(__name__)
        CORS(self.app)
        self.setup_routes()

            # ===== CPU 記憶體優化 =====
        import gc
        
        # 設定 PyTorch 使用更少記憶體
        torch.set_num_threads(2)  # 限制 CPU 線程數
        
        # 如果偵測到 CPU，強制垃圾回收
        if self.device.type == 'cpu':
            gc.collect()
            
        logger.info(f"Memory optimization for CPU enabled")
        # ===== 優化結束 =====
        
        logger.info("AI Detection Service initialized successfully")
    
    def load_latest_model(self):
        """Load the latest model from weights folder"""
        try:
            list_of_files = glob.glob(os.path.join(self.weights_folder, 'model_epoch_*.pth'))
            if not list_of_files:
                raise FileNotFoundError(f"No model files found in {self.weights_folder}")
            
            latest_file = max(list_of_files, key=os.path.getctime)
            logger.info(f"Loading model from: {latest_file}")
            
            checkpoint = torch.load(latest_file, map_location=self.device)
            self.model.load_state_dict(checkpoint['model_state_dict'])
            
            logger.info("Model loaded successfully")
            return self.model
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise e
    
    def setup_routes(self):
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'service': 'ai-detection',
                'device': str(self.device),
                'model_loaded': True,
                'timestamp': datetime.now().isoformat()
            })
        
        @self.app.route('/stats', methods=['GET'])
        def get_stats():
            """Get service statistics"""
            uptime = datetime.now() - self.stats['start_time']
            return jsonify({
                'frames_processed': self.stats['frames_processed'],
                'errors': self.stats['errors'],
                'real_detections': self.stats['real_detections'],
                'fake_detections': self.stats['fake_detections'],
                'no_face_detections': self.stats['no_face_detections'],
                'uptime_seconds': int(uptime.total_seconds()),
                'last_analysis': self.stats['last_analysis'],
                'device': str(self.device),
                'status': 'running'
            })
        
        @self.app.route('/analyze', methods=['POST'])
        def analyze_frame():
            """Main endpoint to analyze AI detection in a frame"""
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
                result = self.analyze_ai_from_base64(student_id, frame_data)
                
                # Update stats
                self.stats['frames_processed'] += 1
                self.stats['last_analysis'] = datetime.now().isoformat()
                
                if result.get('success'):
                    ai_detection = result.get('ai_detection', 'unknown')
                    if ai_detection == 'real':
                        self.stats['real_detections'] += 1
                    elif ai_detection == 'fake':
                        self.stats['fake_detections'] += 1
                    elif not result.get('face_detected'):
                        self.stats['no_face_detections'] += 1
                
                return jsonify(result)
                
            except Exception as e:
                logger.error(f"Error in analyze_frame: {str(e)}")
                self.stats['errors'] += 1
                return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
    
    def analyze_ai_from_base64(self, student_id, frame_data):
        """Convert base64 image to OpenCV frame and analyze AI detection"""
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
            
            # Analyze AI detection using the frame
            ai_result = self.analyze_opencv_frame(opencv_frame)
            
            # Add metadata
            ai_result['studentId'] = student_id
            ai_result['timestamp'] = datetime.now().isoformat()
            ai_result['frame_size'] = {
                'width': opencv_frame.shape[1],
                'height': opencv_frame.shape[0]
            }
            
            return ai_result
            
        except Exception as e:
            logger.error(f"Error processing frame for student {student_id}: {str(e)}")
            raise e
    
    def analyze_opencv_frame(self, frame):
        """Analyze AI detection using the trained model"""
        try:
            # Convert to grayscale for face detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            
            if len(faces) == 0:
                return {
                    'success': True,
                    'ai_detection': 'no_face',
                    'ai_text': 'No face detected',
                    'confidence': 0.0,
                    'face_detected': False,
                    'face_coordinates': None
                }
            
            # Take the first (largest) face
            (x, y, w, h) = faces[0]
            face_img = frame[y:y+h, x:x+w]
            
            # Convert face to PIL Image for model prediction
            face_pil = Image.fromarray(cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB))
            
            # Predict using the model
            predicted_label, confidence = self.predict_single_image(face_pil)


            # ===== 分析完成後的記憶體清理 =====
            import gc
            if 'gray' in locals():
                del gray
            if 'faces' in locals():
                del faces
            if 'face_img' in locals():
                del face_img
            if 'face_pil' in locals():
                del face_pil
            gc.collect()
            # ===== 清理結束 =====
            
            # Prepare response
            ai_text_map = {
                "real": "Real person",
                "fake": "AI generated"
            }
            
            return {
                'success': True,
                'ai_detection': predicted_label,
                'ai_text': ai_text_map.get(predicted_label, predicted_label),
                'confidence': float(confidence),
                'face_detected': True,
                'face_coordinates': {
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h)
                }
            }

            
        except Exception as e:
            logger.error(f"Error analyzing frame: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'ai_detection': 'error',
                'ai_text': 'Analysis failed',
                'confidence': 0.0,
                'face_detected': False
            }
    
    def predict_single_image(self, image):
        """Predict if image is real or fake using the trained model"""
        try:
            # Convert to RGB if needed
            image = image.convert("RGB")
            
            # Apply transforms
            transformed_image = self.transform(image).unsqueeze(0).to(self.device)
            
            # Set model to evaluation mode
            self.model.eval()
            
            with torch.no_grad():
                outputs = self.model(transformed_image)
                probabilities = torch.nn.functional.softmax(outputs.logits, dim=1)
                confidence_scores = probabilities.cpu().numpy()[0]
                _, predicted = outputs.logits.max(1)
            
            predicted_label = self.label_map[predicted.item()]
            confidence = float(confidence_scores[predicted.item()])

            #cpu clean
            import gc
        
            # 清理大的 tensor 變數
            if 'transformed_image' in locals():
                del transformed_image
            if 'outputs' in locals():
                del outputs
            if 'probabilities' in locals():
                del probabilities
            if 'confidence_scores' in locals():
                del confidence_scores
            if 'predicted' in locals():
                del predicted
                
            # 移除 CUDA 相關代碼（因為你用 CPU）
            # if torch.cuda.is_available():
            #     torch.cuda.empty_cache()
            
            # 強制垃圾回收
            gc.collect()
            # ===== 記憶體清理結束 =====



            return predicted_label, confidence

        except Exception as e:
            logger.error(f"Error in model prediction: {str(e)}")
            return "error", 0.0
    
    def run(self, host='localhost', port=5001, debug=False):
        """Start the Flask server"""
        logger.info(f"Starting AI Detection Service on {host}:{port}")
        self.app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    # Create and run the service
    try:
        service = AIDetectionService()
        # Run on all interfaces so Node.js can access it
        service.run(host='0.0.0.0', port=5001, debug=False)
    except Exception as e:
        logger.error(f"Failed to start AI Detection Service: {str(e)}")
        exit(1)