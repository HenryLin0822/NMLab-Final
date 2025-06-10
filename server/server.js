const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const axios = require('axios'); // Add this dependency

class ExamMonitoringServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.connectedStudents = new Map();
        this.connectedTeachers = new Map();
        this.studentIdCounter = 1;
        
        // Gaze tracking configuration
        this.gazeServiceUrl = process.env.GAZE_SERVICE_URL || 'http://localhost:5000';
        this.gazeEnabled = process.env.ENABLE_GAZE_TRACKING !== 'false';
        this.gazeAnalysisQueue = new Map(); // Track pending analyses
        
        // AI detection configuration
        this.aiDetectionServiceUrl = process.env.AI_DETECTION_SERVICE_URL || 'http://localhost:5001';
        this.aiDetectionEnabled = process.env.ENABLE_AI_DETECTION !== 'false';
        this.aiDetectionAnalysisQueue = new Map(); // Track pending AI analyses
        
        // Face recognition configuration
        this.faceRecognitionServiceUrl = process.env.FACE_RECOGNITION_SERVICE_URL || 'http://localhost:5002';
        this.faceRecognitionEnabled = process.env.ENABLE_FACE_RECOGNITION !== 'false';
        this.faceRecognitionAnalysisQueue = new Map(); // Track pending face recognition analyses
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketNamespaces();
        this.initializeGazeService();
        this.initializeAIDetectionService();
        this.initializeFaceRecognitionService();
    }
    
    async initializeGazeService() {
        if (!this.gazeEnabled) {
            console.log('🔍 Gaze tracking disabled');
            return;
        }
        
        try {
            console.log(`🔍 Connecting to gaze service at ${this.gazeServiceUrl}`);
            const response = await axios.get(`${this.gazeServiceUrl}/health`, { timeout: 5000 });
            console.log('✅ Gaze service connected successfully');
        } catch (error) {
            console.warn('⚠️  Gaze service not available. Continuing without gaze tracking.');
            console.warn(`   Start Python service: python gaze_service.py`);
            this.gazeEnabled = false;
        }
    }
    
    async initializeAIDetectionService() {
        if (!this.aiDetectionEnabled) {
            console.log('🤖 AI detection disabled');
            return;
        }
        
        try {
            console.log(`🤖 Connecting to AI detection service at ${this.aiDetectionServiceUrl}`);
            const response = await axios.get(`${this.aiDetectionServiceUrl}/health`, { timeout: 5000 });
            console.log('✅ AI detection service connected successfully');
        } catch (error) {
            console.warn('⚠️  AI detection service not available. Continuing without AI detection.');
            console.warn(`   Start Python service: python ai_detect_service.py`);
            this.aiDetectionEnabled = false;
        }
    }
    
    async initializeFaceRecognitionService() {
        if (!this.faceRecognitionEnabled) {
            console.log('👤 Face recognition disabled');
            return;
        }
        
        try {
            console.log(`👤 Connecting to face recognition service at ${this.faceRecognitionServiceUrl}`);
            const response = await axios.get(`${this.faceRecognitionServiceUrl}/health`, { timeout: 5000 });
            console.log('✅ Face recognition service connected successfully');
        } catch (error) {
            console.warn('⚠️  Face recognition service not available. Continuing without face recognition.');
            console.warn(`   Start Python service: python face_recognition_service.py`);
            this.faceRecognitionEnabled = false;
        }
    }
    
    setupMiddleware() {
        // Enable CORS
        this.app.use(cors());
        
        // Parse JSON bodies
        this.app.use(express.json({ limit: '10mb' }));
        
        // Serve static files from client directory
        this.app.use(express.static(path.join(__dirname, '../client')));
        
        // Log requests
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            next();
        });
    }
    
    setupRoutes() {
        // Teacher dashboard route
        this.app.get('/teacher', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/teacher/index.html'));
        });
        
        // Student monitoring route
        this.app.get('/student', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/student/index.html'));
        });
        
        // Default route
        this.app.get('/', (req, res) => {
            res.send(`
                <h1>Exam Monitoring System</h1>
                <p><a href="/teacher">Teacher Dashboard</a></p>
                <p><a href="/student">Student Monitor</a></p>
                <p><strong>Gaze Tracking:</strong> ${this.gazeEnabled ? 'Enabled' : 'Disabled'}</p>
                <p><strong>AI Detection:</strong> ${this.aiDetectionEnabled ? 'Enabled' : 'Disabled'}</p>
                <p><strong>Face Recognition:</strong> ${this.faceRecognitionEnabled ? 'Enabled' : 'Disabled'}</p>
            `);
        });
        
        // API status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                connectedStudents: this.connectedStudents.size,
                connectedTeachers: this.connectedTeachers.size,
                gazeTracking: this.gazeEnabled,
                gazeServiceUrl: this.gazeServiceUrl,
                aiDetection: this.aiDetectionEnabled,
                aiDetectionServiceUrl: this.aiDetectionServiceUrl,
                faceRecognition: this.faceRecognitionEnabled,
                faceRecognitionServiceUrl: this.faceRecognitionServiceUrl,
                timestamp: new Date().toISOString()
            });
        });
        
        // Services status endpoint
        this.app.get('/api/services/status', async (req, res) => {
            const gazeStatus = await this.checkServiceHealth(this.gazeServiceUrl);
            const aiDetectionStatus = await this.checkServiceHealth(this.aiDetectionServiceUrl);
            const faceRecognitionStatus = await this.checkServiceHealth(this.faceRecognitionServiceUrl);
            
            res.json({
                gaze_service: gazeStatus,
                ai_detection_service: aiDetectionStatus,
                face_recognition_service: faceRecognitionStatus,
                timestamp: new Date().toISOString()
            });
        });
        
        // Gaze service proxy endpoint
        this.app.get('/api/gaze/stats', async (req, res) => {
            if (!this.gazeEnabled) {
                return res.json({ error: 'Gaze tracking disabled' });
            }
            
            try {
                const response = await axios.get(`${this.gazeServiceUrl}/stats`);
                res.json(response.data);
            } catch (error) {
                res.status(500).json({ error: 'Gaze service unavailable' });
            }
        });
        
        // AI detection service proxy endpoint
        this.app.get('/api/ai-detection/stats', async (req, res) => {
            if (!this.aiDetectionEnabled) {
                return res.json({ error: 'AI detection disabled' });
            }
            
            try {
                const response = await axios.get(`${this.aiDetectionServiceUrl}/stats`);
                res.json(response.data);
            } catch (error) {
                res.status(500).json({ error: 'AI detection service unavailable' });
            }
        });
        
        // Face recognition service proxy endpoints
        this.app.get('/api/face-recognition/stats', async (req, res) => {
            if (!this.faceRecognitionEnabled) {
                return res.json({ error: 'Face recognition disabled' });
            }
            
            try {
                const response = await axios.get(`${this.faceRecognitionServiceUrl}/stats`);
                res.json(response.data);
            } catch (error) {
                res.status(500).json({ error: 'Face recognition service unavailable' });
            }
        });

        // Student registration endpoint
        this.app.post('/api/face-recognition/register', async (req, res) => {
            if (!this.faceRecognitionEnabled) {
                return res.status(503).json({ error: 'Face recognition disabled' });
            }
            
            try {
                const response = await axios.post(
                    `${this.faceRecognitionServiceUrl}/register`,
                    req.body,
                    {
                        timeout: 10000,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                res.json(response.data);
            } catch (error) {
                console.error('Face registration error:', error.message);
                res.status(500).json({ error: 'Face registration failed' });
            }
        });
    }
    
    async checkServiceHealth(serviceUrl) {
        try {
            const response = await axios.get(`${serviceUrl}/health`, { timeout: 3000 });
            return response.data.status === 'healthy';
        } catch (error) {
            return false;
        }
    }
    
    setupSocketNamespaces() {
        // Teacher namespace
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.on('connection', (socket) => {
            console.log(`Teacher connected: ${socket.id}`);
            
            // Add teacher to connected teachers
            this.connectedTeachers.set(socket.id, {
                id: socket.id,
                connectedAt: new Date()
            });
            
            // Send current student list to teacher
            this.sendStudentListToTeacher(socket);
            
            // Send gaze tracking status
            socket.emit('gazeTrackingStatus', {
                enabled: this.gazeEnabled,
                serviceUrl: this.gazeServiceUrl
            });
            
            // Send AI detection status
            socket.emit('aiDetectionStatus', {
                enabled: this.aiDetectionEnabled,
                serviceUrl: this.aiDetectionServiceUrl
            });
            
            // Send face recognition status
            socket.emit('faceRecognitionStatus', {
                enabled: this.faceRecognitionEnabled,
                serviceUrl: this.faceRecognitionServiceUrl
            });
            
            // Handle teacher disconnect
            socket.on('disconnect', () => {
                console.log(`Teacher disconnected: ${socket.id}`);
                this.connectedTeachers.delete(socket.id);
            });
        });
        
        // Student namespace
        const studentNamespace = this.io.of('/student');
        studentNamespace.on('connection', (socket) => {
            // Assign student ID
            const studentId = this.studentIdCounter++;
            const studentInfo = {
                id: socket.id,
                studentId: studentId,
                name: `Student ${studentId}`,
                connectedAt: new Date(),
                gazeHistory: [], // Track gaze analysis history
                aiDetectionHistory: [], // Track AI detection history
                faceRecognitionHistory: [], // Track face recognition history
                lastAIDetectionTime: 0,
                lastFaceRecognitionTime: 0, // Face recognition timing control
                faceRegistered: false // Track if student has uploaded reference photo
            };
            
            this.connectedStudents.set(socket.id, studentInfo);
            console.log(`Student connected: ${studentInfo.name} (${socket.id})`);
            
            // Send student ID to the student
            socket.emit('studentAssigned', {
                studentId: studentId,
                name: studentInfo.name,
                gazeTrackingEnabled: this.gazeEnabled,
                aiDetectionEnabled: this.aiDetectionEnabled,
                faceRecognitionEnabled: this.faceRecognitionEnabled
            });
            
            // Notify all teachers about new student
            this.notifyTeachersStudentJoined(studentInfo);
            
            // Handle video stream from student
            socket.on('videoFrame', async (frameData) => {
                await this.handleVideoFrame(studentInfo, frameData);
            });
            
            // Handle student face registration
            socket.on('registerFace', async (data) => {
                try {
                    const registrationData = {
                        studentId: studentInfo.studentId,
                        studentName: studentInfo.name,
                        referenceImage: data.referenceImage
                    };
                    
                    const response = await axios.post(
                        `${this.faceRecognitionServiceUrl}/register`,
                        registrationData,
                        {
                            timeout: 10000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    
                    if (response.data.success) {
                        studentInfo.faceRegistered = true;
                        socket.emit('faceRegistrationResult', {
                            success: true,
                            message: 'Face registration successful'
                        });
                        
                        // Notify teachers
                        const teacherNamespace = this.io.of('/teacher');
                        teacherNamespace.emit('studentFaceRegistered', {
                            studentSocketId: studentInfo.id,
                            studentId: studentInfo.studentId,
                            studentName: studentInfo.name,
                            timestamp: new Date().toISOString()
                        });
                        
                        console.log(`Face registered for ${studentInfo.name}`);
                    } else {
                        socket.emit('faceRegistrationResult', {
                            success: false,
                            error: response.data.error || 'Registration failed'
                        });
                    }
                    
                } catch (error) {
                    console.error(`Face registration error for ${studentInfo.name}:`, error.message);
                    socket.emit('faceRegistrationResult', {
                        success: false,
                        error: 'Registration service unavailable'
                    });
                }
            });
            
            // Handle student disconnect
            socket.on('disconnect', () => {
                console.log(`Student disconnected: ${studentInfo.name} (${socket.id})`);
                this.connectedStudents.delete(socket.id);
                this.notifyTeachersStudentLeft(studentInfo);
            });
        });
    }
    
    async handleVideoFrame(studentInfo, frameData) {
        // Broadcast frame to teachers immediately
        this.broadcastFrameToTeachers(studentInfo, frameData);
        
        // Perform gaze analysis if enabled
        if (this.gazeEnabled) {
            await this.analyzeGazeAsync(studentInfo, frameData);
        }
        
        // Perform AI detection analysis if enabled
        if (this.aiDetectionEnabled) {
            await this.analyzeAIDetectionAsync(studentInfo, frameData);
        }
        
        // Perform face recognition analysis if enabled
        if (this.faceRecognitionEnabled) {
            await this.analyzeFaceRecognitionAsync(studentInfo, frameData);
        }
    }
    
    async analyzeGazeAsync(studentInfo, frameData) {
        try {
            // Avoid overwhelming the gaze service
            const pendingAnalysis = this.gazeAnalysisQueue.get(studentInfo.id);
            if (pendingAnalysis) {
                return; // Skip if analysis already in progress
            }
            
            // Mark analysis as pending
            this.gazeAnalysisQueue.set(studentInfo.id, Date.now());
            
            // Prepare data for gaze service
            const analysisData = {
                studentId: studentInfo.studentId,
                frameData: frameData.dataUrl
            };
            
            // Send to gaze service
            const response = await axios.post(
                `${this.gazeServiceUrl}/analyze`,
                analysisData,
                {
                    timeout: 3000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            
            const gazeResult = response.data;
            
            // Add gaze result to student's history
            studentInfo.gazeHistory.push({
                timestamp: new Date().toISOString(),
                direction: gazeResult.gaze_direction,
                confidence: gazeResult.confidence
            });
            
            // Keep only last 10 results
            if (studentInfo.gazeHistory.length > 10) {
                studentInfo.gazeHistory.shift();
            }
            
            // Broadcast gaze result to teachers
            this.broadcastGazeResultToTeachers(studentInfo, gazeResult);
            
            // Check for alerts (looking away for too long)
            this.checkGazeAlerts(studentInfo, gazeResult);
            
        } catch (error) {
            console.error(`Gaze analysis failed for ${studentInfo.name}:`, error.message);
        } finally {
            // Remove from pending queue
            this.gazeAnalysisQueue.delete(studentInfo.id);
        }
    }
    
    async analyzeAIDetectionAsync(studentInfo, frameData) {
        try {
            // Avoid overwhelming the AI detection service
            const pendingAnalysis = this.aiDetectionAnalysisQueue.get(studentInfo.id);
            if (pendingAnalysis) {
                return; // Skip if analysis already in progress
            }

            // 10-second interval control
            const now = Date.now();
            const lastAnalysisTime = studentInfo.lastAIDetectionTime || 0;
            const timeSinceLastAnalysis = now - lastAnalysisTime;
            
            if (timeSinceLastAnalysis < 10000) { // 10 seconds = 10000ms
                return; // Skip if less than 10 seconds since last analysis
            }
            
            // Update last analysis time
            studentInfo.lastAIDetectionTime = now;
            
            // Mark analysis as pending
            this.aiDetectionAnalysisQueue.set(studentInfo.id, Date.now());
            
            // Prepare data for AI detection service
            const analysisData = {
                studentId: studentInfo.studentId,
                frameData: frameData.dataUrl
            };
            
            // Send to AI detection service
            const response = await axios.post(
                `${this.aiDetectionServiceUrl}/analyze`,
                analysisData,
                {
                    timeout: 5000, // AI detection may take longer
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            
            const aiDetectionResult = response.data;
            
            // Add AI detection result to student's history
            studentInfo.aiDetectionHistory.push({
                timestamp: new Date().toISOString(),
                detection: aiDetectionResult.ai_detection,
                confidence: aiDetectionResult.confidence
            });
            
            // Keep only last 10 results
            if (studentInfo.aiDetectionHistory.length > 10) {
                studentInfo.aiDetectionHistory.shift();
            }
            
            // Broadcast AI detection result to teachers
            this.broadcastAIDetectionResultToTeachers(studentInfo, aiDetectionResult);
            
            // Check for AI detection alerts
            this.checkAIDetectionAlerts(studentInfo, aiDetectionResult);
            
        } catch (error) {
            console.error(`AI detection analysis failed for ${studentInfo.name}:`, error.message);
        } finally {
            // Remove from pending queue
            this.aiDetectionAnalysisQueue.delete(studentInfo.id);
        }
    }
    
    async analyzeFaceRecognitionAsync(studentInfo, frameData) {
        try {
            // Skip if student hasn't registered a reference photo
            if (!studentInfo.faceRegistered) {
                return;
            }
            
            // Avoid overwhelming the face recognition service
            const pendingAnalysis = this.faceRecognitionAnalysisQueue.get(studentInfo.id);
            if (pendingAnalysis) {
                return; // Skip if analysis already in progress
            }

            // 10-second interval control (same as AI detection)
            const now = Date.now();
            const lastAnalysisTime = studentInfo.lastFaceRecognitionTime || 0;
            const timeSinceLastAnalysis = now - lastAnalysisTime;
            
            if (timeSinceLastAnalysis < 10000) { // 10 seconds = 10000ms
                return; // Skip if less than 10 seconds since last analysis
            }
            
            // Update last analysis time
            studentInfo.lastFaceRecognitionTime = now;
            
            // Mark analysis as pending
            this.faceRecognitionAnalysisQueue.set(studentInfo.id, Date.now());
            
            // Prepare data for face recognition service
            const analysisData = {
                studentId: studentInfo.studentId,
                frameData: frameData.dataUrl
            };
            
            // Send to face recognition service
            const response = await axios.post(
                `${this.faceRecognitionServiceUrl}/analyze`,
                analysisData,
                {
                    timeout: 5000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            
            const faceRecognitionResult = response.data;
            
            // Add face recognition result to student's history
            studentInfo.faceRecognitionHistory.push({
                timestamp: new Date().toISOString(),
                verification: faceRecognitionResult.face_verification,
                confidence: faceRecognitionResult.confidence
            });
            
            // Keep only last 10 results
            if (studentInfo.faceRecognitionHistory.length > 10) {
                studentInfo.faceRecognitionHistory.shift();
            }
            
            // Broadcast face recognition result to teachers
            this.broadcastFaceRecognitionResultToTeachers(studentInfo, faceRecognitionResult);
            
            // Check for face recognition alerts
            this.checkFaceRecognitionAlerts(studentInfo, faceRecognitionResult);
            
        } catch (error) {
            console.error(`Face recognition analysis failed for ${studentInfo.name}:`, error.message);
        } finally {
            // Remove from pending queue
            this.faceRecognitionAnalysisQueue.delete(studentInfo.id);
        }
    }
    
    checkGazeAlerts(studentInfo, gazeResult) {
        const recentHistory = studentInfo.gazeHistory.slice(-5); // Last 5 analyses
        
        // Alert if student has been looking away for multiple consecutive frames
        const lookingAway = recentHistory.filter(h => 
            h.direction === 'left' || h.direction === 'right'
        );
        
        if (lookingAway.length >= 5) {
            this.sendGazeAlert(studentInfo, {
                type: 'looking_away',
                message: `${studentInfo.name} has been looking away from screen`,
                severity: 'warning',
                duration: lookingAway.length
            });
        }
        
        // Alert if student has been blinking excessively
        const blinking = recentHistory.filter(h => h.direction === 'blinking');
        if (blinking.length >= 50) {
            this.sendGazeAlert(studentInfo, {
                type: 'excessive_blinking',
                message: `${studentInfo.name} may be experiencing fatigue`,
                severity: 'info',
                duration: blinking.length
            });
        }
    }
    
    checkAIDetectionAlerts(studentInfo, aiDetectionResult) {
        const recentHistory = studentInfo.aiDetectionHistory.slice(-3); // Last 3 analyses
        
        // Alert if AI-generated content is detected
        if (aiDetectionResult.ai_detection === 'fake') {
            this.sendAIDetectionAlert(studentInfo, {
                type: 'ai_generated_content',
                message: `${studentInfo.name} - AI generated content detected`,
                severity: 'danger',
                confidence: aiDetectionResult.confidence
            });
        }
        
        // Alert if multiple consecutive fake detections
        const fakeDetections = recentHistory.filter(h => h.detection === 'fake');
        if (fakeDetections.length >= 2) {
            this.sendAIDetectionAlert(studentInfo, {
                type: 'repeated_ai_detection',
                message: `${studentInfo.name} - Multiple AI detections in sequence`,
                severity: 'danger',
                count: fakeDetections.length
            });
        }
        
        // Alert if no face detected multiple times (possible evasion)
        const noFaceDetections = recentHistory.filter(h => h.detection === 'no_face');
        if (noFaceDetections.length >= 3) {
            this.sendAIDetectionAlert(studentInfo, {
                type: 'no_face_detected',
                message: `${studentInfo.name} - Face not visible for AI detection`,
                severity: 'warning',
                count: noFaceDetections.length
            });
        }
    }
    
    checkFaceRecognitionAlerts(studentInfo, faceRecognitionResult) {
        const recentHistory = studentInfo.faceRecognitionHistory.slice(-3); // Last 3 analyses
        
        // Alert if face verification fails
        if (faceRecognitionResult.face_verification === 'no_match') {
            this.sendFaceRecognitionAlert(studentInfo, {
                type: 'identity_mismatch',
                message: `${studentInfo.name} - Identity verification failed`,
                severity: 'danger',
                confidence: faceRecognitionResult.confidence
            });
        }
        
        // Alert if multiple consecutive verification failures
        const failedVerifications = recentHistory.filter(h => h.verification === 'no_match');
        if (failedVerifications.length >= 2) {
            this.sendFaceRecognitionAlert(studentInfo, {
                type: 'repeated_identity_failure',
                message: `${studentInfo.name} - Multiple identity verification failures`,
                severity: 'danger',
                count: failedVerifications.length
            });
        }
        
        // Alert if no face detected multiple times (possible evasion)
        const noFaceDetections = recentHistory.filter(h => h.verification === 'no_face');
        if (noFaceDetections.length >= 3) {
            this.sendFaceRecognitionAlert(studentInfo, {
                type: 'no_face_detected',
                message: `${studentInfo.name} - Face not visible for verification`,
                severity: 'warning',
                count: noFaceDetections.length
            });
        }
    }
    
    sendGazeAlert(studentInfo, alert) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('gazeAlert', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            studentName: studentInfo.name,
            alert: alert,
            timestamp: new Date().toISOString()
        });
    }
    
    sendAIDetectionAlert(studentInfo, alert) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('aiDetectionAlert', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            studentName: studentInfo.name,
            alert: alert,
            timestamp: new Date().toISOString()
        });
    }
    
    sendFaceRecognitionAlert(studentInfo, alert) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('faceRecognitionAlert', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            studentName: studentInfo.name,
            alert: alert,
            timestamp: new Date().toISOString()
        });
    }
    
    sendStudentListToTeacher(teacherSocket) {
        const studentList = Array.from(this.connectedStudents.values()).map(student => ({
            socketId: student.id,
            studentId: student.studentId,
            name: student.name,
            connectedAt: student.connectedAt,
            gazeHistory: student.gazeHistory || [],
            aiDetectionHistory: student.aiDetectionHistory || [],
            faceRecognitionHistory: student.faceRecognitionHistory || [],
            faceRegistered: student.faceRegistered || false
        }));
        
        teacherSocket.emit('studentList', studentList);
    }
    
    notifyTeachersStudentJoined(studentInfo) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentJoined', {
            socketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            connectedAt: studentInfo.connectedAt
        });
    }
    
    notifyTeachersStudentLeft(studentInfo) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentLeft', {
            socketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name
        });
    }
    
    broadcastFrameToTeachers(studentInfo, frameData) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentVideoFrame', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            frameData: frameData,
            timestamp: new Date().toISOString()
        });
    }
    
    broadcastGazeResultToTeachers(studentInfo, gazeResult) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentGazeUpdate', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            gazeData: gazeResult,
            timestamp: new Date().toISOString()
        });
    }
    
    broadcastAIDetectionResultToTeachers(studentInfo, aiDetectionResult) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentAIDetectionUpdate', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            aiDetectionData: aiDetectionResult,
            timestamp: new Date().toISOString()
        });
    }
    
    broadcastFaceRecognitionResultToTeachers(studentInfo, faceRecognitionResult) {
        const teacherNamespace = this.io.of('/teacher');
        teacherNamespace.emit('studentFaceRecognitionUpdate', {
            studentSocketId: studentInfo.id,
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            faceRecognitionData: faceRecognitionResult,
            timestamp: new Date().toISOString()
        });
    }
    
    start(port = 3000) {
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Exam Monitoring Server running on port ${port}`);
            console.log(`👩‍🏫 Teacher Dashboard: http://localhost:${port}/teacher`);
            console.log(`👨‍🎓 Student Monitor: http://localhost:${port}/student`);
            console.log(`📊 API Status: http://localhost:${port}/api/status`);
            console.log(`🔍 Gaze Tracking: ${this.gazeEnabled ? 'Enabled' : 'Disabled'}`);
            console.log(`🤖 AI Detection: ${this.aiDetectionEnabled ? 'Enabled' : 'Disabled'}`);
            console.log(`👤 Face Recognition: ${this.faceRecognitionEnabled ? 'Enabled' : 'Disabled'}`);
            
            // Show network interfaces
            this.showNetworkInterfaces(port);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
    
    shutdown() {
        console.log('\n🛑 Shutting down server...');
        this.server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    }
    
    showNetworkInterfaces(port) {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        
        console.log('\n📡 Available network addresses:');
        Object.keys(interfaces).forEach(name => {
            interfaces[name].forEach(iface => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`   ${name}: http://${iface.address}:${port}`);
                }
            });
        });
        console.log('');
    }
}

// Start the server
const server = new ExamMonitoringServer();
const PORT = process.env.PORT || 3000;
server.start(PORT);