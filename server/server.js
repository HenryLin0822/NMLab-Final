const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

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
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketNamespaces();
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
            `);
        });
        
        // API status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                connectedStudents: this.connectedStudents.size,
                connectedTeachers: this.connectedTeachers.size,
                timestamp: new Date().toISOString()
            });
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
                connectedAt: new Date()
            };
            
            this.connectedStudents.set(socket.id, studentInfo);
            console.log(`Student connected: ${studentInfo.name} (${socket.id})`);
            
            // Send student ID to the student
            socket.emit('studentAssigned', {
                studentId: studentId,
                name: studentInfo.name
            });
            
            // Notify all teachers about new student
            this.notifyTeachersStudentJoined(studentInfo);
            
            // Handle video stream from student
            socket.on('videoFrame', (frameData) => {
                this.broadcastFrameToTeachers(studentInfo, frameData);
            });
            
            // Handle student disconnect
            socket.on('disconnect', () => {
                console.log(`Student disconnected: ${studentInfo.name} (${socket.id})`);
                this.connectedStudents.delete(socket.id);
                this.notifyTeachersStudentLeft(studentInfo);
            });
        });
    }
    
    sendStudentListToTeacher(teacherSocket) {
        const studentList = Array.from(this.connectedStudents.values()).map(student => ({
            socketId: student.id,
            studentId: student.studentId,
            name: student.name,
            connectedAt: student.connectedAt
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
    
    start(port = 3000) {
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Exam Monitoring Server running on port ${port}`);
            console.log(`👩‍🏫 Teacher Dashboard: http://localhost:${port}/teacher`);
            console.log(`👨‍🎓 Student Monitor: http://localhost:${port}/student`);
            console.log(`📊 API Status: http://localhost:${port}/api/status`);
            
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