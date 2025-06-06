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
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketNamespaces();
        this.initializeGazeService();
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
                gazeHistory: [] // Track gaze analysis history
            };
            
            this.connectedStudents.set(socket.id, studentInfo);
            console.log(`Student connected: ${studentInfo.name} (${socket.id})`);
            
            // Send student ID to the student
            socket.emit('studentAssigned', {
                studentId: studentId,
                name: studentInfo.name,
                gazeTrackingEnabled: this.gazeEnabled
            });
            
            // Notify all teachers about new student
            this.notifyTeachersStudentJoined(studentInfo);
            
            // Handle video stream from student
            socket.on('videoFrame', async (frameData) => {
                await this.handleVideoFrame(studentInfo, frameData);
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
    
    checkGazeAlerts(studentInfo, gazeResult) {
        const recentHistory = studentInfo.gazeHistory.slice(-5); // Last 5 analyses
        
        // Alert if student has been looking away for multiple consecutive frames
        const lookingAway = recentHistory.filter(h => 
            h.direction === 'left' || h.direction === 'right'
        );
        
        if (lookingAway.length >= 3) {
            this.sendGazeAlert(studentInfo, {
                type: 'looking_away',
                message: `${studentInfo.name} has been looking away from screen`,
                severity: 'warning',
                duration: lookingAway.length
            });
        }
        
        // Alert if student has been blinking excessively
        const blinking = recentHistory.filter(h => h.direction === 'blinking');
        if (blinking.length >= 4) {
            this.sendGazeAlert(studentInfo, {
                type: 'excessive_blinking',
                message: `${studentInfo.name} may be experiencing fatigue`,
                severity: 'info',
                duration: blinking.length
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
    
    sendStudentListToTeacher(teacherSocket) {
        const studentList = Array.from(this.connectedStudents.values()).map(student => ({
            socketId: student.id,
            studentId: student.studentId,
            name: student.name,
            connectedAt: student.connectedAt,
            gazeHistory: student.gazeHistory || []
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
    
    start(port = 3000) {
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Exam Monitoring Server running on port ${port}`);
            console.log(`👩‍🏫 Teacher Dashboard: http://localhost:${port}/teacher`);
            console.log(`👨‍🎓 Student Monitor: http://localhost:${port}/student`);
            console.log(`📊 API Status: http://localhost:${port}/api/status`);
            console.log(`🔍 Gaze Tracking: ${this.gazeEnabled ? 'Enabled' : 'Disabled'}`);
            
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