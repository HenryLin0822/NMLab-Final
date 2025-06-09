"""
Modern Face Recognition System
A reliable, easy-to-use face recognition system using the face_recognition library.
No manual weight downloads required!

Installation:
pip install face_recognition opencv-python pywin32

Usage:
1. Create an 'images' folder
2. Add reference photos named with person's name (e.g., john.jpg, mary.png)
3. Run this script
4. Press ESC to exit, R to reset detection
"""

import cv2
import face_recognition
import os
import glob
import numpy as np
from multiprocessing.dummy import Pool
import time
import json
from datetime import datetime

# Try to import Windows voice interface
try:
    import win32com.client as wincl
    windows10_voice_interface = wincl.Dispatch("SAPI.SpVoice")
    VOICE_AVAILABLE = True
except ImportError:
    print("⚠️ Windows voice interface not available. Voice announcements disabled.")
    VOICE_AVAILABLE = False

# Global variables
PADDING = 20
ready_to_detect_identity = True

# Improved recognition thresholds
RECOGNITION_THRESHOLD = 0.5  # Maximum distance for any recognition
STRONG_MATCH_THRESHOLD = 0.4  # Distance for high confidence matches
WEAK_MATCH_THRESHOLD = 0.5   # Distance for low confidence matches  
MIN_CONFIDENCE_FOR_ANNOUNCEMENT = 0.55  # Minimum confidence to announce someone

DETECTION_COOLDOWN = 3  # seconds

class FaceRecognitionSystem:
    def __init__(self):
        self.database = {}
        self.known_encodings = []
        self.known_names = []
        self.last_detection_time = 0
        self.detection_log = []
        
    def load_database(self):
        """Load and encode all images from the images folder"""
        print("🔄 Loading face database...")
        
        # Check if images folder exists
        if not os.path.exists("images"):
            print("❌ 'images' folder not found!")
            print("Creating 'images' folder...")
            os.makedirs("images")
            self._show_setup_instructions()
            return False
        
        # Find all image files
        image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.tiff', '*.gif']
        image_files = []
        for extension in image_extensions:
            image_files.extend(glob.glob(f"images/{extension}"))
            image_files.extend(glob.glob(f"images/{extension.upper()}"))
        
        if not image_files:
            print("⚠️ No images found in 'images' folder!")
            self._show_setup_instructions()
            return False
        
        print(f"📁 Found {len(image_files)} image files")
        
        # Process each image
        successful_loads = 0
        for image_path in image_files:
            success = self._process_image(image_path)
            if success:
                successful_loads += 1
        
        if successful_loads == 0:
            print("❌ No faces could be processed from the images!")
            self._show_troubleshooting()
            return False
        
        print(f"✅ Successfully loaded {successful_loads}/{len(image_files)} images")
        print(f"📊 Database ready with {len(self.database)} people")
        
        # Save database summary
        self._save_database_info()
        return True
    
    def _process_image(self, image_path):
        """Process a single image and add to database"""
        try:
            # Get person's name from filename
            name = os.path.splitext(os.path.basename(image_path))[0]
            name = name.replace('_', ' ').replace('-', ' ').title()
            
            print(f"🔄 Processing {name}...")
            
            # Load image
            image = face_recognition.load_image_file(image_path)
            
            # Find face encodings
            face_locations = face_recognition.face_locations(image, model="hog")
            face_encodings = face_recognition.face_encodings(image, face_locations)
            
            if not face_encodings:
                print(f"❌ No face found in {image_path}")
                return False
            
            if len(face_encodings) > 1:
                print(f"⚠️ Multiple faces found in {image_path}, using the first one")
            
            # Use the first (or only) face encoding
            encoding = face_encodings[0]
            
            # Add to database
            self.database[name] = encoding
            self.known_encodings.append(encoding)
            self.known_names.append(name)
            
            print(f"✅ {name} added to database")
            return True
            
        except Exception as e:
            print(f"❌ Error processing {image_path}: {e}")
            return False
    
    def _show_setup_instructions(self):
        """Show setup instructions to user"""
        print("\n" + "="*60)
        print("📋 SETUP INSTRUCTIONS")
        print("="*60)
        print("1. Add reference photos to the 'images' folder")
        print("2. Name files with the person's name:")
        print("   Examples: john.jpg, mary_smith.png, bob-jones.jpeg")
        print("3. Supported formats: .jpg, .jpeg, .png, .bmp, .tiff")
        print("4. Requirements for best results:")
        print("   • One face per image")
        print("   • Clear, well-lit photos")
        print("   • Face should be clearly visible")
        print("   • Avoid sunglasses or hats covering the face")
        print("="*60)
    
    def _show_troubleshooting(self):
        """Show troubleshooting tips"""
        print("\n" + "="*60)
        print("🔧 TROUBLESHOOTING")
        print("="*60)
        print("If no faces are detected:")
        print("• Make sure faces are clearly visible and well-lit")
        print("• Try different photos with better quality")
        print("• Avoid photos with multiple people")
        print("• Check if image files are corrupted")
        print("• Supported formats: JPG, PNG, BMP, TIFF")
        print("="*60)
    
    def _save_database_info(self):
        """Save database information to a file"""
        try:
            info = {
                "created": datetime.now().isoformat(),
                "people_count": len(self.database),
                "people_names": list(self.database.keys()),
                "settings": {
                    "recognition_threshold": RECOGNITION_THRESHOLD,
                    "strong_match_threshold": STRONG_MATCH_THRESHOLD,
                    "weak_match_threshold": WEAK_MATCH_THRESHOLD,
                    "min_confidence_for_announcement": MIN_CONFIDENCE_FOR_ANNOUNCEMENT,
                    "detection_cooldown": DETECTION_COOLDOWN
                }
            }
            
            with open("face_database_info.json", "w") as f:
                json.dump(info, f, indent=2)
                
        except Exception as e:
            print(f"⚠️ Could not save database info: {e}")
    
    def recognize_faces_in_frame(self, frame):
        """Recognize faces in a video frame with improved unknown detection"""
        # Resize frame for faster processing
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = small_frame[:, :, ::-1]  # BGR to RGB
        
        # Find face locations and encodings
        face_locations = face_recognition.face_locations(rgb_small_frame, model="hog")
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)
        
        face_info = []
        
        for face_encoding, face_location in zip(face_encodings, face_locations):
            # Scale back up face locations
            top, right, bottom, left = face_location
            top *= 4
            right *= 4
            bottom *= 4
            left *= 4
            
            name = "Unknown"
            confidence = 0
            distance = float('inf')
            
            if len(self.known_encodings) > 0:
                # Calculate distances to all known faces
                face_distances = face_recognition.face_distance(self.known_encodings, face_encoding)
                best_match_index = np.argmin(face_distances)
                best_distance = face_distances[best_match_index]
                confidence = 1 - best_distance
                distance = best_distance
                
                # Multi-level confidence thresholds for better accuracy
                if best_distance <= 0.4:  # Very confident match
                    name = self.known_names[best_match_index]
                    print(f"🎯 Strong match: {name} (confidence: {confidence:.3f}, distance: {distance:.3f})")
                elif best_distance <= 0.5:  # Moderate confidence
                    name = self.known_names[best_match_index]
                    print(f"🎯 Good match: {name} (confidence: {confidence:.3f}, distance: {distance:.3f})")
                elif best_distance <= RECOGNITION_THRESHOLD:  # Weak but acceptable
                    name = self.known_names[best_match_index]
                    print(f"⚠️ Weak match: {name} (confidence: {confidence:.3f}, distance: {distance:.3f})")
                else:  # Too uncertain - mark as unknown
                    closest_name = self.known_names[best_match_index]
                    print(f"❌ Unknown person (closest to {closest_name}, confidence: {confidence:.3f}, distance: {distance:.3f})")
                    name = "Unknown"
                    confidence = 0
            
            face_info.append({
                'name': name,
                'confidence': confidence,
                'distance': distance,
                'location': (left, top, right, bottom)
            })
        
        return face_info
    
    def draw_face_info(self, frame, face_info):
        """Draw face rectangles and names on frame with confidence indicators"""
        for face in face_info:
            left, top, right, bottom = face['location']
            name = face['name']
            confidence = face['confidence']
            distance = face.get('distance', 0)
            
            # Choose color and label based on recognition confidence
            if name != "Unknown":
                if confidence >= 0.6:  # High confidence
                    color = (0, 255, 0)  # Green
                    label = f"{name} ({confidence:.2f})"
                elif confidence >= 0.5:  # Medium confidence  
                    color = (0, 255, 255)  # Yellow
                    label = f"{name}? ({confidence:.2f})"
                else:  # Low confidence
                    color = (0, 165, 255)  # Orange
                    label = f"{name}?? ({confidence:.2f})"
            else:
                color = (0, 0, 255)  # Red for unknown
                if distance != float('inf') and distance > 0:
                    label = f"Unknown (d:{distance:.2f})"
                else:
                    label = "Unknown"
            
            # Draw rectangle around face with thickness based on confidence
            thickness = 3 if confidence >= 0.6 else 2 if confidence >= 0.5 else 1
            cv2.rectangle(frame, (left, top), (right, bottom), color, thickness)
            
            # Draw label background
            label_height = 35 if confidence >= 0.5 else 30
            cv2.rectangle(frame, (left, bottom - label_height), (right, bottom), color, cv2.FILLED)
            
            # Draw label text
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.6 if confidence >= 0.5 else 0.5
            cv2.putText(frame, label, (left + 6, bottom - 6), font, font_scale, (255, 255, 255), 1)
            
            # Add confidence bar for known faces
            if name != "Unknown" and confidence > 0:
                bar_width = right - left
                confidence_width = int(bar_width * confidence)
                cv2.rectangle(frame, (left, top - 10), (left + confidence_width, top - 5), color, cv2.FILLED)
                cv2.rectangle(frame, (left, top - 10), (right, top - 5), (100, 100, 100), 1)
        
        return frame
    
    def welcome_users(self, recognized_names):
        """Welcome recognized users with voice and logging"""
        global ready_to_detect_identity
        
        try:
            current_time = time.time()
            
            # Remove duplicates while preserving order
            unique_names = list(dict.fromkeys(recognized_names))
            
            # Create welcome message
            if len(unique_names) == 1:
                welcome_message = f"Welcome {unique_names[0]}, have a nice day!"
            else:
                if len(unique_names) == 2:
                    welcome_message = f"Welcome {unique_names[0]} and {unique_names[1]}, have a nice day!"
                else:
                    names_part = ", ".join(unique_names[:-1])
                    welcome_message = f"Welcome {names_part}, and {unique_names[-1]}, have a nice day!"
            
            print(f"🎵 {welcome_message}")
            
            # Log the detection
            self._log_detection(unique_names)
            
            # Speak the message if voice is available
            if VOICE_AVAILABLE:
                try:
                    windows10_voice_interface.Speak(welcome_message)
                except Exception as e:
                    print(f"⚠️ Voice announcement failed: {e}")
            
            # Wait before allowing next detection
            time.sleep(DETECTION_COOLDOWN)
            ready_to_detect_identity = True
            
        except Exception as e:
            print(f"❌ Error in welcome_users: {e}")
            ready_to_detect_identity = True
    
    def _log_detection(self, names):
        """Log detection to file"""
        try:
            detection_entry = {
                "timestamp": datetime.now().isoformat(),
                "names": names,
                "count": len(names)
            }
            
            self.detection_log.append(detection_entry)
            
            # Save to file
            log_filename = f"detections_{datetime.now().strftime('%Y%m%d')}.json"
            
            # Load existing log if it exists
            existing_log = []
            if os.path.exists(log_filename):
                try:
                    with open(log_filename, 'r') as f:
                        existing_log = json.load(f)
                except:
                    existing_log = []
            
            # Append new detection
            existing_log.append(detection_entry)
            
            # Save updated log
            with open(log_filename, 'w') as f:
                json.dump(existing_log, f, indent=2)
                
        except Exception as e:
            print(f"⚠️ Could not log detection: {e}")
    
    def run_camera_loop(self):
        """Main camera loop"""
        global ready_to_detect_identity
        
        print("🎥 Starting camera...")
        print("📹 Controls: ESC = Exit, R = Reset detection, S = Show stats")
        
        # Initialize camera
        video_capture = cv2.VideoCapture(1)
        
        if not video_capture.isOpened():
            print("❌ Error: Could not open camera")
            return
        
        # Set camera properties for better performance
        video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        video_capture.set(cv2.CAP_PROP_FPS, 30)
        
        frame_count = 0
        fps_counter = time.time()
        fps_display = 0
        
        try:
            while True:
                ret, frame = video_capture.read()
                if not ret:
                    print("❌ Failed to capture frame")
                    break
                
                frame_count += 1
                
                # Calculate FPS
                if frame_count % 30 == 0:
                    current_time = time.time()
                    fps_display = 30 / (current_time - fps_counter)
                    fps_counter = current_time
                
                # Process faces (every 5th frame for performance)
                if ready_to_detect_identity and frame_count % 5 == 0:
                    face_info = self.recognize_faces_in_frame(frame)
                    
                    # Check for recognized faces with sufficient confidence
                    recognized_names = [
                        f['name'] for f in face_info 
                        if f['name'] != "Unknown" and f['confidence'] >= MIN_CONFIDENCE_FOR_ANNOUNCEMENT
                    ]
                    
                    if recognized_names:
                        ready_to_detect_identity = False
                        pool = Pool(processes=1)
                        pool.apply_async(self.welcome_users, [recognized_names])
                else:
                    # Still detect faces for display, but don't process recognition
                    small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                    rgb_small_frame = small_frame[:, :, ::-1]
                    face_locations = face_recognition.face_locations(rgb_small_frame, model="hog")
                    
                    face_info = []
                    for face_location in face_locations:
                        top, right, bottom, left = face_location
                        face_info.append({
                            'name': "Processing..." if not ready_to_detect_identity else "Detecting...",
                            'confidence': 0,
                            'location': (left*4, top*4, right*4, bottom*4)
                        })
                
                # Draw face information
                frame = self.draw_face_info(frame, face_info)
                
                # Draw status information
                status_color = (0, 255, 0) if ready_to_detect_identity else (0, 165, 255)
                status_text = "READY" if ready_to_detect_identity else "PROCESSING"
                
                cv2.putText(frame, f"Status: {status_text}", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
                cv2.putText(frame, f"Database: {len(self.database)} people", (10, 60), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                cv2.putText(frame, f"FPS: {fps_display:.1f}", (10, 90), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                cv2.putText(frame, f"Faces: {len(face_info)}", (10, 120), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                
                # Show the frame
                cv2.imshow('Modern Face Recognition System', frame)
                
                # Handle key presses
                key = cv2.waitKey(1) & 0xFF
                if key == 27:  # ESC
                    break
                elif key == ord('r') or key == ord('R'):  # Reset
                    ready_to_detect_identity = True
                    print("🔄 Detection reset")
                elif key == ord('s') or key == ord('S'):  # Stats
                    self._show_stats()
        
        except KeyboardInterrupt:
            print("\n👋 Program interrupted by user")
        
        finally:
            video_capture.release()
            cv2.destroyAllWindows()
            print("📷 Camera closed")
    
    def _show_stats(self):
        """Show system statistics"""
        print("\n" + "="*50)
        print("📊 SYSTEM STATISTICS")
        print("="*50)
        print(f"People in database: {len(self.database)}")
        print(f"Names: {', '.join(self.known_names)}")
        print(f"Total detections today: {len(self.detection_log)}")
        print(f"Recognition thresholds:")
        print(f"  • Strong match: ≤ {STRONG_MATCH_THRESHOLD} distance")
        print(f"  • Weak match: ≤ {WEAK_MATCH_THRESHOLD} distance") 
        print(f"  • Announcement threshold: ≥ {MIN_CONFIDENCE_FOR_ANNOUNCEMENT} confidence")
        print(f"Detection cooldown: {DETECTION_COOLDOWN}s")
        print(f"Voice announcements: {'Enabled' if VOICE_AVAILABLE else 'Disabled'}")
        print("="*50)

def main():
    """Main function"""
    print("🚀 Modern Face Recognition System")
    print("=" * 60)
    print("🎯 Features:")
    print("• Real-time face detection and recognition")
    print("• Voice announcements (Windows)")
    print("• Detection logging")
    print("• No manual setup required")
    print("• High accuracy with modern algorithms")
    print("=" * 60)
    
    # Create system instance
    face_system = FaceRecognitionSystem()
    
    # Load database
    if not face_system.load_database():
        print("\n❌ Cannot proceed without a valid face database")
        print("Please add images and try again")
        input("Press Enter to exit...")
        return
    
    print(f"\n✅ System initialized successfully!")
    print(f"🎭 Ready to recognize {len(face_system.database)} people")
    
    # Start the camera loop
    try:
        face_system.run_camera_loop()
    except Exception as e:
        print(f"❌ System error: {e}")
    finally:
        print("👋 Thank you for using Modern Face Recognition System!")

if __name__ == "__main__":
    main()