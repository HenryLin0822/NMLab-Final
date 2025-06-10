// Enhanced Teacher WebSocket Manager with Face Recognition Support
class TeacherWebSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.students = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // Service status tracking
        this.gazeEnabled = false;
        this.aiDetectionEnabled = false;
        this.faceRecognitionEnabled = false;
        
        // Alert tracking
        this.gazeAlerts = new Map();
        this.aiDetectionAlerts = new Map();
        this.faceRecognitionAlerts = new Map();
        
        this.setupEventHandlers();
    }
    
    connect() {
        try {
            Utils.log('Teacher attempting to connect to server...');
            Utils.updateStatus('connectionStatus', 'Connecting...', 'status-connecting');
            
            // Connect to teacher namespace
            this.socket = io('/teacher');
            this.setupSocketEventListeners();
            
        } catch (error) {
            Utils.log('Failed to connect to server: ' + error.message, 'error');
            Utils.updateStatus('connectionStatus', 'Connection Failed', 'status-disconnected');
            Utils.showNotification('Failed to connect to server', 'error');
        }
    }
    
    setupSocketEventListeners() {
        // Connection successful
        this.socket.on('connect', () => {
            Utils.log('Connected to server as teacher');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            Utils.updateStatus('connectionStatus', 'Connected', 'status-connected');
            Utils.showNotification('Connected to monitoring server', 'success');
            
            // Request current student list
            this.requestStudentList();
        });
        
        // Service status updates
        this.socket.on('gazeTrackingStatus', (data) => {
            this.gazeEnabled = data.enabled;
            this.updateServiceIndicator('gazeStatus', data.enabled, 'Gaze Tracking');
            Utils.log(`Gaze tracking: ${data.enabled ? 'Enabled' : 'Disabled'}`);
        });
        
        this.socket.on('aiDetectionStatus', (data) => {
            this.aiDetectionEnabled = data.enabled;
            this.updateServiceIndicator('aiStatus', data.enabled, 'AI Detection');
            Utils.log(`AI detection: ${data.enabled ? 'Enabled' : 'Disabled'}`);
        });
        
        // NEW: Face recognition status
        this.socket.on('faceRecognitionStatus', (data) => {
            this.faceRecognitionEnabled = data.enabled;
            this.updateServiceIndicator('faceStatus', data.enabled, 'Face Recognition');
            Utils.log(`Face recognition: ${data.enabled ? 'Enabled' : 'Disabled'}`);
            
            // Dispatch event for other components
            this.dispatchCustomEvent('faceRecognitionServiceStatus', data);
        });
        
        // Student management events
        this.socket.on('studentList', (studentList) => {
            Utils.log(`Received student list: ${studentList.length} students`);
            this.updateStudentList(studentList);
        });
        
        this.socket.on('studentJoined', (studentInfo) => {
            Utils.log(`Student joined: ${studentInfo.name}`);
            this.addStudent(studentInfo);
        });
        
        this.socket.on('studentLeft', (studentInfo) => {
            Utils.log(`Student left: ${studentInfo.name}`);
            this.removeStudent(studentInfo.socketId);
        });
        
        // Video stream events
        this.socket.on('studentVideoFrame', (data) => {
            this.updateStudentVideo(data);
        });
        
        // Monitoring data events
        this.socket.on('studentGazeUpdate', (data) => {
            this.updateStudentGazeData(data);
        });
        
        this.socket.on('studentAIDetectionUpdate', (data) => {
            this.updateStudentAIData(data);
        });
        
        // NEW: Face recognition events
        this.socket.on('studentFaceRecognitionUpdate', (data) => {
            this.updateStudentFaceRecognitionData(data);
        });
        
        this.socket.on('studentFaceRegistered', (data) => {
            this.handleStudentFaceRegistered(data);
        });
        
        // Alert events
        this.socket.on('gazeAlert', (alertData) => {
            this.handleGazeAlert(alertData);
        });
        
        this.socket.on('aiDetectionAlert', (alertData) => {
            this.handleAIDetectionAlert(alertData);
        });
        
        // NEW: Face recognition alerts
        this.socket.on('faceRecognitionAlert', (alertData) => {
            this.handleFaceRecognitionAlert(alertData);
        });
        
        // Connection error handling
        this.socket.on('connect_error', (error) => {
            Utils.log('Connection error: ' + error.message, 'error');
            this.isConnected = false;
            Utils.updateStatus('connectionStatus', 'Connection Error', 'status-disconnected');
            this.handleReconnect();
        });
        
        this.socket.on('disconnect', (reason) => {
            Utils.log('Disconnected from server: ' + reason, 'warn');
            this.isConnected = false;
            Utils.updateStatus('connectionStatus', 'Disconnected', 'status-disconnected');
            
            if (reason === 'io server disconnect') {
                this.handleReconnect();
            }
        });
        
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
    }
    
    updateServiceIndicator(indicatorId, enabled, serviceName) {
        const indicator = document.getElementById(indicatorId);
        if (indicator) {
            if (enabled) {
                indicator.classList.add('service-enabled');
                indicator.classList.remove('service-disabled');
                indicator.title = `${serviceName}: Enabled`;
            } else {
                indicator.classList.add('service-disabled');
                indicator.classList.remove('service-enabled');
                indicator.title = `${serviceName}: Disabled`;
            }
        }
    }
    
    updateStudentList(studentList) {
        this.students.clear();
        
        studentList.forEach(student => {
            this.students.set(student.socketId, {
                ...student,
                lastGazeData: null,
                lastAIData: null,
                lastFaceData: null,
                gazeHistory: student.gazeHistory || [],
                aiDetectionHistory: student.aiDetectionHistory || [],
                faceRecognitionHistory: student.faceRecognitionHistory || [],
                faceRegistered: student.faceRegistered || false
            });
        });
        
        // Update UI
        this.updateStudentCount();
        this.dispatchStudentListUpdate();
    }
    
    addStudent(studentInfo) {
        this.students.set(studentInfo.socketId, {
            ...studentInfo,
            lastGazeData: null,
            lastAIData: null,
            lastFaceData: null,
            gazeHistory: [],
            aiDetectionHistory: [],
            faceRecognitionHistory: [],
            faceRegistered: false
        });
        
        this.updateStudentCount();
        this.dispatchStudentJoined(studentInfo);
        
        // Log activity
        this.dispatchActivity(`${studentInfo.name} joined the session`, 'student-joined');
    }
    
    removeStudent(socketId) {
        const student = this.students.get(socketId);
        if (student) {
            this.students.delete(socketId);
            this.updateStudentCount();
            this.dispatchStudentLeft(student);
            
            // Clean up alerts for this student
            this.gazeAlerts.delete(socketId);
            this.aiDetectionAlerts.delete(socketId);
            this.faceRecognitionAlerts.delete(socketId);
            
            // Log activity
            this.dispatchActivity(`${student.name} left the session`, 'student-left');
        }
    }
    
    updateStudentVideo(data) {
        const student = this.students.get(data.studentSocketId);
        if (student) {
            student.lastFrameData = data.frameData;
            student.lastFrameTime = data.timestamp;
            
            // Dispatch to grid
            this.dispatchVideoUpdate(data);
        }
    }
    
    updateStudentGazeData(data) {
        const student = this.students.get(data.studentSocketId);
        if (student) {
            student.lastGazeData = data.gazeData;
            student.gazeHistory.push({
                timestamp: data.timestamp,
                direction: data.gazeData.gaze_direction,
                confidence: data.gazeData.confidence
            });
            
            // Keep only last 20 items
            if (student.gazeHistory.length > 20) {
                student.gazeHistory.shift();
            }
            
            // Dispatch to grid
            this.dispatchGazeUpdate(data);
        }
    }
    
    updateStudentAIData(data) {
        const student = this.students.get(data.studentSocketId);
        if (student) {
            student.lastAIData = data.aiDetectionData;
            student.aiDetectionHistory.push({
                timestamp: data.timestamp,
                detection: data.aiDetectionData.ai_detection,
                confidence: data.aiDetectionData.confidence
            });
            
            // Keep only last 20 items
            if (student.aiDetectionHistory.length > 20) {
                student.aiDetectionHistory.shift();
            }
            
            // Dispatch to grid
            this.dispatchAIUpdate(data);
        }
    }
    
    // NEW: Update student face recognition data
    updateStudentFaceRecognitionData(data) {
        const student = this.students.get(data.studentSocketId);
        if (student) {
            student.lastFaceData = data.faceRecognitionData;
            student.faceRecognitionHistory.push({
                timestamp: data.timestamp,
                verification: data.faceRecognitionData.face_verification,
                confidence: data.faceRecognitionData.confidence
            });
            
            // Keep only last 20 items
            if (student.faceRecognitionHistory.length > 20) {
                student.faceRecognitionHistory.shift();
            }
            
            // Dispatch to grid
            this.dispatchFaceRecognitionUpdate(data);
        }
    }
    
    // NEW: Handle student face registration
    handleStudentFaceRegistered(data) {
        const student = this.students.get(data.studentSocketId);
        if (student) {
            student.faceRegistered = true;
            
            // Log activity
            this.dispatchActivity(`${data.studentName} completed face registration`, 'face-registered');
            
            // Dispatch to grid
            this.dispatchCustomEvent('studentFaceRegistered', data);
        }
    }
    
    // Alert handlers
    handleGazeAlert(alertData) {
        this.gazeAlerts.set(alertData.studentSocketId, alertData);
        this.dispatchAlert('gaze', alertData);
        
        Utils.log(`Gaze alert: ${alertData.alert.message}`);
        this.dispatchActivity(alertData.alert.message, 'gaze-alert');
    }
    
    handleAIDetectionAlert(alertData) {
        this.aiDetectionAlerts.set(alertData.studentSocketId, alertData);
        this.dispatchAlert('ai', alertData);
        
        Utils.log(`AI detection alert: ${alertData.alert.message}`);
        this.dispatchActivity(alertData.alert.message, 'ai-alert');
    }
    
    // NEW: Handle face recognition alerts
    handleFaceRecognitionAlert(alertData) {
        this.faceRecognitionAlerts.set(alertData.studentSocketId, alertData);
        this.dispatchAlert('face', alertData);
        
        Utils.log(`Face recognition alert: ${alertData.alert.message}`);
        this.dispatchActivity(alertData.alert.message, 'face-alert');
        
        // Show high-priority alert modal for identity issues
        if (alertData.alert.severity === 'danger') {
            this.showFaceRecognitionAlertModal(alertData);
        }
    }
    
    // NEW: Show face recognition alert modal
    showFaceRecognitionAlertModal(alertData) {
        const modal = document.getElementById('faceAlertModal');
        const details = document.getElementById('faceAlertDetails');
        
        if (modal && details) {
            details.innerHTML = `
                <div class="alert-student-info">
                    <h4>${alertData.studentName} (ID: ${alertData.studentId})</h4>
                    <p class="alert-timestamp">${new Date(alertData.timestamp).toLocaleString()}</p>
                </div>
                <div class="alert-message ${alertData.alert.severity}">
                    <strong>${alertData.alert.type.replace(/_/g, ' ').toUpperCase()}</strong>
                    <p>${alertData.alert.message}</p>
                    ${alertData.alert.confidence !== undefined ? 
                        `<p>Confidence: ${Math.round(alertData.alert.confidence * 100)}%</p>` : ''}
                </div>
            `;
            
            // Store alert data for modal actions
            modal.dataset.studentSocketId = alertData.studentSocketId;
            modal.dataset.alertType = alertData.alert.type;
            
            modal.classList.remove('hidden');
            
            // Auto-hide after 10 seconds for non-critical alerts
            if (alertData.alert.severity !== 'danger') {
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 10000);
            }
        }
    }
    
    updateStudentCount() {
        const count = this.students.size;
        Utils.updateStatus('studentCount', `${count} Student${count !== 1 ? 's' : ''}`);
    }
    
    requestStudentList() {
        if (this.isConnected && this.socket) {
            this.socket.emit('requestStudentList');
        }
    }
    
    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            Utils.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            Utils.updateStatus('connectionStatus', 'Reconnecting...', 'status-connecting');
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connect();
                }
            }, delay);
        } else {
            Utils.log('Max reconnection attempts reached', 'error');
            Utils.updateStatus('connectionStatus', 'Connection Lost', 'status-disconnected');
            Utils.showNotification('Connection lost. Please refresh the page.', 'error');
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        Utils.updateStatus('connectionStatus', 'Disconnected', 'status-disconnected');
    }
    
    // Event dispatchers
    // Complete fix for the Event Dispatchers section in teacherWebSocket.js
    // Replace the existing event dispatcher methods (around line 450-500) with this:

    // Event dispatchers
    dispatchStudentListUpdate() {
        this.dispatchCustomEvent('studentListReceived', 
            Array.from(this.students.values())
        );
    }

    dispatchStudentJoined(studentInfo) {
        this.dispatchCustomEvent('studentJoined', studentInfo);
    }

    dispatchStudentLeft(studentInfo) {
        this.dispatchCustomEvent('studentLeft', studentInfo);
    }

    dispatchVideoUpdate(data) {
        this.dispatchCustomEvent('studentVideoFrame', data);
    }

    dispatchGazeUpdate(data) {
        this.dispatchCustomEvent('studentGazeUpdate', data);
    }

    dispatchAIUpdate(data) {
        this.dispatchCustomEvent('studentAIDetectionUpdate', data);
    }

    // Face recognition update dispatcher
    dispatchFaceRecognitionUpdate(data) {
        this.dispatchCustomEvent('studentFaceRecognitionUpdate', data);
    }

    dispatchAlert(type, alertData) {
        // Dispatch specific alert events that studentGrid.js expects
        if (type === 'gaze') {
            this.dispatchCustomEvent('gazeAlert', alertData);
        } else if (type === 'ai') {
            this.dispatchCustomEvent('aiDetectionAlert', alertData);
        } else if (type === 'face') {
            this.dispatchCustomEvent('faceRecognitionAlert', alertData);
        }
        
        // Also dispatch generic monitoring alert for alert manager
        this.dispatchCustomEvent('monitoringAlert', {
            type: type,
            data: alertData
        });
    }

    dispatchActivity(message, type) {
        this.dispatchCustomEvent('activityUpdate', {
            message: message,
            type: type
        });
    }

    dispatchCustomEvent(eventName, data) {
        const event = new CustomEvent(eventName, {
            detail: data
        });
        document.dispatchEvent(event);
    }

    // Also fix the setupEventHandlers method to listen for the correct event:
    setupEventHandlers() {
        // Listen for grid refresh requests
        document.addEventListener('refreshStudentGrid', () => {
            this.requestStudentList();
        });
        
        // Listen for show student detail requests
        document.addEventListener('showStudentDetail', (event) => {
            // Forward to student grid
            if (window.studentGrid && window.studentGrid.showDetailView) {
                window.studentGrid.showDetailView(event.detail.studentSocketId);
            }
        });
    }
    // Public methods for external access
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            studentCount: this.students.size,
            reconnectAttempts: this.reconnectAttempts,
            servicesEnabled: {
                gaze: this.gazeEnabled,
                aiDetection: this.aiDetectionEnabled,
                faceRecognition: this.faceRecognitionEnabled
            }
        };
    }
    
    getStudent(socketId) {
        return this.students.get(socketId);
    }
    
    getAllStudents() {
        return Array.from(this.students.values());
    }
    
    // NEW: Get face recognition statistics
    getFaceRecognitionStatistics() {
        const students = Array.from(this.students.values());
        const registeredStudents = students.filter(s => s.faceRegistered);
        const studentsWithData = students.filter(s => s.faceRecognitionHistory.length > 0);
        
        let matchCount = 0;
        let mismatchCount = 0;
        let noFaceCount = 0;
        let totalConfidence = 0;
        let confidenceCount = 0;
        
        students.forEach(student => {
            if (student.faceRecognitionHistory.length > 0) {
                const recent = student.faceRecognitionHistory.slice(-5); // Last 5 results
                recent.forEach(entry => {
                    if (entry.verification === 'match') matchCount++;
                    else if (entry.verification === 'no_match') mismatchCount++;
                    else if (entry.verification === 'no_face') noFaceCount++;
                    
                    if (entry.confidence !== undefined) {
                        totalConfidence += entry.confidence;
                        confidenceCount++;
                    }
                });
            }
        });
        
        return {
            totalStudents: students.length,
            registeredStudents: registeredStudents.length,
            studentsWithData: studentsWithData.length,
            verificationCounts: {
                match: matchCount,
                no_match: mismatchCount,
                no_face: noFaceCount
            },
            averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
            activeAlerts: this.faceRecognitionAlerts.size
        };
    }
    
    getGazeStatistics() {
        const students = Array.from(this.students.values());
        const studentsWithData = students.filter(s => s.gazeHistory.length > 0);
        
        return {
            totalStudents: students.length,
            studentsWithData: studentsWithData.length,
            activeAlerts: this.gazeAlerts.size
        };
    }
    
    getAIDetectionStatistics() {
        const students = Array.from(this.students.values());
        const studentsWithData = students.filter(s => s.aiDetectionHistory.length > 0);
        
        let realCount = 0;
        let fakeCount = 0;
        let noFaceCount = 0;
        
        students.forEach(student => {
            if (student.aiDetectionHistory.length > 0) {
                const recent = student.aiDetectionHistory.slice(-5); // Last 5 results
                recent.forEach(entry => {
                    if (entry.detection === 'real') realCount++;
                    else if (entry.detection === 'fake') fakeCount++;
                    else if (entry.detection === 'no_face') noFaceCount++;
                });
            }
        });
        
        return {
            totalStudents: students.length,
            studentsWithData: studentsWithData.length,
            detectionCounts: {
                real: realCount,
                fake: fakeCount,
                no_face: noFaceCount
            },
            activeAlerts: this.aiDetectionAlerts.size
        };
    }
    
    // Alert management
    getActiveAlerts() {
        return {
            gaze: Array.from(this.gazeAlerts.values()),
            ai: Array.from(this.aiDetectionAlerts.values()),
            face: Array.from(this.faceRecognitionAlerts.values())
        };
    }
    
    clearAlert(type, studentSocketId) {
        switch (type) {
            case 'gaze':
                this.gazeAlerts.delete(studentSocketId);
                break;
            case 'ai':
                this.aiDetectionAlerts.delete(studentSocketId);
                break;
            case 'face':
                this.faceRecognitionAlerts.delete(studentSocketId);
                break;
        }
        
        // Dispatch alert cleared event
        this.dispatchCustomEvent('alertCleared', {
            type: type,
            studentSocketId: studentSocketId
        });
    }
    
    clearAllAlerts() {
        this.gazeAlerts.clear();
        this.aiDetectionAlerts.clear();
        this.faceRecognitionAlerts.clear();
        
        this.dispatchCustomEvent('allAlertsCleared');
    }
    
    // NEW: Export face recognition report
    exportFaceRecognitionReport() {
        const stats = this.getFaceRecognitionStatistics();
        const students = this.getAllStudents();
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalStudents: stats.totalStudents,
                registeredStudents: stats.registeredStudents,
                studentsAnalyzed: stats.studentsWithData,
                registrationRate: Math.round((stats.registeredStudents / stats.totalStudents) * 100),
                averageConfidence: Math.round(stats.averageConfidence * 100)
            },
            verifications: stats.verificationCounts,
            alerts: {
                active: stats.activeAlerts,
                details: Array.from(this.faceRecognitionAlerts.values())
            },
            studentDetails: students.filter(s => s.faceRegistered).map(student => ({
                name: student.name,
                studentId: student.studentId,
                registered: student.faceRegistered,
                lastVerification: student.lastFaceData ? {
                    result: student.lastFaceData.face_verification,
                    confidence: Math.round((student.lastFaceData.confidence || 0) * 100),
                    timestamp: student.faceRecognitionHistory.length > 0 ? 
                        student.faceRecognitionHistory[student.faceRecognitionHistory.length - 1].timestamp : null
                } : null,
                historyCount: student.faceRecognitionHistory.length
            }))
        };
        
        // Create and download the report
        const blob = new Blob([JSON.stringify(report, null, 2)], 
                            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `face-recognition-report-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.dispatchActivity('Face recognition report exported', 'export');
        Utils.showNotification('Face recognition report downloaded', 'success');
        
        return report;
    }
}

// Create global instance
window.teacherWebSocket = new TeacherWebSocket();