// Teacher WebSocket Manager
class TeacherWebSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        this.connectedStudents = new Map();
        this.setupEventHandlers();
    }
    
    connect() {
        try {
            Utils.log('Teacher attempting to connect to server...');
            Utils.updateStatus('serverStatus', 'Connecting...', 'status-connecting');
            
            // Connect to teacher namespace
            this.socket = io('/teacher');
            this.setupSocketEventListeners();
            
        } catch (error) {
            Utils.log('Failed to connect to server: ' + error.message, 'error');
            Utils.updateStatus('serverStatus', 'Connection Failed', 'status-disconnected');
            Utils.showNotification('Failed to connect to server', 'error');
        }
    }
    
    setupSocketEventListeners() {
        // Connection successful
        this.socket.on('connect', () => {
            Utils.log('Connected to server as teacher');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            Utils.updateStatus('serverStatus', 'Connected', 'status-connected');
            Utils.showNotification('Connected to monitoring server', 'success');
            
            // Request current student list
            this.requestStudentList();
        });
        
        // Receive current student list
        this.socket.on('studentList', (studentList) => {
            Utils.log(`Received student list: ${studentList.length} students`);
            
            // Clear current students and add from list
            this.connectedStudents.clear();
            studentList.forEach(student => {
                this.connectedStudents.set(student.socketId, student);
            });
            
            // Update UI
            this.updateStudentCount();
            this.dispatchStudentListEvent(studentList);
        });
        
        // Student joined
        this.socket.on('studentJoined', (studentInfo) => {
            Utils.log(`Student joined: ${studentInfo.name}`);
            
            this.connectedStudents.set(studentInfo.socketId, studentInfo);
            this.updateStudentCount();
            
            // Dispatch event for grid to handle
            this.dispatchStudentJoinedEvent(studentInfo);
            
            // Add to activity log
            this.addActivity(`${studentInfo.name} joined the exam`, 'student-joined');
            Utils.showNotification(`${studentInfo.name} joined`, 'success');
        });
        
        // Student left
        this.socket.on('studentLeft', (studentInfo) => {
            Utils.log(`Student left: ${studentInfo.name}`);
            
            this.connectedStudents.delete(studentInfo.socketId);
            this.updateStudentCount();
            
            // Dispatch event for grid to handle
            this.dispatchStudentLeftEvent(studentInfo);
            
            // Add to activity log
            this.addActivity(`${studentInfo.name} left the exam`, 'student-left');
            Utils.showNotification(`${studentInfo.name} left`, 'warning');
        });
        
        // Receive video frame from student
        this.socket.on('studentVideoFrame', (frameData) => {
            // Dispatch frame data to grid manager
            this.dispatchVideoFrameEvent(frameData);
        });
        
        // Connection error
        this.socket.on('connect_error', (error) => {
            Utils.log('Connection error: ' + error.message, 'error');
            this.isConnected = false;
            
            Utils.updateStatus('serverStatus', 'Connection Error', 'status-disconnected');
            this.handleReconnect();
        });
        
        // Disconnected
        this.socket.on('disconnect', (reason) => {
            Utils.log('Disconnected from server: ' + reason, 'warn');
            this.isConnected = false;
            
            Utils.updateStatus('serverStatus', 'Disconnected', 'status-disconnected');
            Utils.updateStatus('studentCount', '0');
            Utils.updateStatus('activeStreams', '0');
            
            // Clear student list
            this.connectedStudents.clear();
            this.dispatchStudentListEvent([]);
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                this.handleReconnect();
            }
        });
        
        // Error handling
        this.socket.on('error', (error) => {
            Utils.log('Socket error: ' + error.message, 'error');
            Utils.showNotification('Connection error occurred', 'error');
        });
    }
    
    setupEventHandlers() {
        // Listen for grid refresh requests
        document.addEventListener('refreshStudentGrid', () => {
            this.requestStudentList();
        });
        
        // Listen for student actions from grid
        document.addEventListener('studentAction', (event) => {
            this.handleStudentAction(event.detail);
        });
    }
    
    requestStudentList() {
        if (this.isConnected && this.socket) {
            Utils.log('Requesting current student list...');
            // The server automatically sends student list on connection
            // But we can emit a request if needed
            this.socket.emit('requestStudentList');
        }
    }
    
    handleStudentAction(action) {
        if (!this.isConnected || !this.socket) {
            Utils.showNotification('Not connected to server', 'error');
            return;
        }
        
        switch (action.type) {
            case 'kick':
                this.kickStudent(action.studentId);
                break;
            case 'mute':
                this.muteStudent(action.studentId);
                break;
            case 'focus':
                this.focusStudent(action.studentId);
                break;
            default:
                Utils.log('Unknown student action: ' + action.type, 'warn');
        }
    }
    
    kickStudent(studentSocketId) {
        if (this.socket) {
            this.socket.emit('kickStudent', { studentId: studentSocketId });
            Utils.log(`Requested to kick student: ${studentSocketId}`);
        }
    }
    
    muteStudent(studentSocketId) {
        if (this.socket) {
            this.socket.emit('muteStudent', { studentId: studentSocketId });
            Utils.log(`Requested to mute student: ${studentSocketId}`);
        }
    }
    
    focusStudent(studentSocketId) {
        if (this.socket) {
            this.socket.emit('focusStudent', { studentId: studentSocketId });
            Utils.log(`Focusing on student: ${studentSocketId}`);
        }
    }
    
    updateStudentCount() {
        const count = this.connectedStudents.size;
        Utils.updateStatus('studentCount', count.toString());
        
        // Count active streams (students with recent frames)
        const activeStreams = Array.from(this.connectedStudents.values())
            .filter(student => student.lastFrameTime && 
                    (Date.now() - new Date(student.lastFrameTime).getTime()) < 10000)
            .length;
        
        Utils.updateStatus('activeStreams', activeStreams.toString());
    }
    
    addActivity(message, type = '') {
        const timestamp = Utils.formatTime(new Date());
        const activity = {
            message: message,
            timestamp: timestamp,
            type: type
        };
        
        // Dispatch activity event
        this.dispatchActivityEvent(activity);
    }
    
    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            Utils.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            Utils.updateStatus('serverStatus', 'Reconnecting...', 'status-connecting');
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connect();
                }
            }, delay);
        } else {
            Utils.log('Max reconnection attempts reached', 'error');
            Utils.updateStatus('serverStatus', 'Connection Lost', 'status-disconnected');
            Utils.showNotification('Connection lost. Please refresh the page.', 'error');
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.connectedStudents.clear();
        Utils.updateStatus('serverStatus', 'Disconnected', 'status-disconnected');
    }
    
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            studentCount: this.connectedStudents.size,
            students: Array.from(this.connectedStudents.values()),
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    // Event dispatchers
    dispatchStudentListEvent(studentList) {
        const event = new CustomEvent('studentListReceived', {
            detail: studentList
        });
        document.dispatchEvent(event);
    }
    
    dispatchStudentJoinedEvent(studentInfo) {
        const event = new CustomEvent('studentJoined', {
            detail: studentInfo
        });
        document.dispatchEvent(event);
    }
    
    dispatchStudentLeftEvent(studentInfo) {
        const event = new CustomEvent('studentLeft', {
            detail: studentInfo
        });
        document.dispatchEvent(event);
    }
    
    dispatchVideoFrameEvent(frameData) {
        const event = new CustomEvent('studentVideoFrame', {
            detail: frameData
        });
        document.dispatchEvent(event);
    }
    
    dispatchActivityEvent(activity) {
        const event = new CustomEvent('activityUpdate', {
            detail: activity
        });
        document.dispatchEvent(event);
    }
}

// Create global instance
window.teacherWebSocket = new TeacherWebSocket();