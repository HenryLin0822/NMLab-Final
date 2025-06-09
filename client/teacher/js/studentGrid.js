<<<<<<< HEAD
=======
/*
>>>>>>> 79b87c5 (add ai detection)
// Enhanced Student Grid Manager with Gaze Tracking and Detail View
class StudentGrid {
    constructor() {
        this.gridContainer = document.getElementById('studentsGrid');
        this.gridSizeSelect = document.getElementById('gridSize');
        
        this.students = new Map(); // socketId -> student data
        this.slots = new Map(); // slotNumber -> student socketId
        this.maxSlots = 10;
        this.currentGridSize = '2x5';
        
        // Gaze tracking state
        this.gazeTrackingEnabled = false;
        this.gazeAlerts = new Map(); // studentId -> alert data
        
        // Detail view references
        this.detailView = {
            container: document.getElementById('studentDetailView'),
            studentName: document.getElementById('detailStudentName'),
            studentNameOverlay: document.getElementById('detailStudentNameOverlay'),
            video: document.getElementById('detailStudentVideo'),
            connectionStatus: document.getElementById('detailConnectionStatus'),
            connectionIndicator: document.getElementById('detailConnectionIndicator'),
            lastFrame: document.getElementById('detailLastFrame'),
            gazeDirection: document.getElementById('detailGazeDirection'),
            gazeConfidence: document.getElementById('detailGazeConfidence'),
            gazeHistory: document.getElementById('detailGazeHistory'),
            alerts: document.getElementById('detailAlerts'),
            otherStudentsAlerts: document.getElementById('otherStudentsAlerts'),
            backBtn: document.getElementById('backToGridBtn'),
            fullscreenBtn: document.getElementById('detailFullscreenBtn')
        };
        
        this.currentDetailStudent = null;
        this.detailContext = null;
        this.otherStudentAlerts = new Map(); // Track alerts from other students
        
        this.setupEventListeners();
        this.initializeGrid();
    }
    
    setupEventListeners() {
        // Grid size change
        this.gridSizeSelect.addEventListener('change', (e) => {
            this.changeGridSize(e.target.value);
        });
        
        // Listen for student events
        document.addEventListener('studentListReceived', (event) => {
            this.handleStudentList(event.detail);
        });
        
        document.addEventListener('studentJoined', (event) => {
            this.addStudent(event.detail);
        });
        
        document.addEventListener('studentLeft', (event) => {
            this.removeStudent(event.detail);
        });
        
        document.addEventListener('studentVideoFrame', (event) => {
            this.updateStudentFrame(event.detail);
        });
        
        // Gaze tracking events
        document.addEventListener('gazeTrackingStatus', (event) => {
            this.handleGazeTrackingStatus(event.detail);
        });
        
        document.addEventListener('studentGazeUpdate', (event) => {
            this.updateStudentGaze(event.detail);
        });
        
        document.addEventListener('gazeAlert', (event) => {
            this.handleGazeAlert(event.detail);
        });
        
        // Detail view event listeners
        if (this.detailView.backBtn) {
            this.detailView.backBtn.addEventListener('click', () => {
                this.hideDetailView();
            });
        }
        
        if (this.detailView.fullscreenBtn) {
            this.detailView.fullscreenBtn.addEventListener('click', () => {
                this.toggleDetailFullscreen();
            });
        }
        
        // Add keyboard handler for escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.currentDetailStudent) {
                this.hideDetailView();
            }
        });
        
        // Handle fullscreen change for detail view
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.detailView.fullscreenBtn) {
                this.detailView.fullscreenBtn.textContent = 'Fullscreen';
            }
        });
    }
    
    initializeGrid() {
        // Set initial grid size
        this.updateGridLayout();
        Utils.log('Student grid initialized');
    }
    
    changeGridSize(newSize) {
        this.currentGridSize = newSize;
        this.updateGridLayout();
        this.updateMaxSlots();
        Utils.log(`Grid size changed to: ${newSize}`);
    }
    
    updateGridLayout() {
        // Remove existing grid class
        this.gridContainer.className = this.gridContainer.className
            .replace(/grid-\w+/g, '');
        
        // Add new grid class
        this.gridContainer.classList.add('students-grid', `grid-${this.currentGridSize}`);
    }
    
    updateMaxSlots() {
        const sizeMap = {
            '2x2': 4,
            '2x3': 6,
            '2x4': 8,
            '2x5': 10,
            '3x4': 12
        };
        
        const newMaxSlots = sizeMap[this.currentGridSize] || 10;
        
        if (newMaxSlots !== this.maxSlots) {
            this.maxSlots = newMaxSlots;
            this.regenerateSlots();
        }
    }
    
    regenerateSlots() {
        // Clear existing slots
        this.gridContainer.innerHTML = '';
        this.slots.clear();
        
        // Create new slots
        for (let i = 1; i <= this.maxSlots; i++) {
            this.createSlot(i);
        }
        
        // Reassign students to slots
        this.reassignStudents();
    }
    
    createSlot(slotNumber) {
        const slot = document.createElement('div');
        slot.className = 'student-slot empty';
        slot.dataset.slot = slotNumber;
        
        slot.innerHTML = `
            <div class="slot-content">
                <div class="empty-message">
                    <div class="slot-number">${slotNumber}</div>
                    <div class="waiting-text">Waiting for student...</div>
                </div>
            </div>
        `;
        
        this.gridContainer.appendChild(slot);
    }
    
    handleStudentList(studentList) {
        Utils.log(`Handling student list: ${studentList.length} students`);
        
        // Clear current students
        this.students.clear();
        this.clearAllSlots();
        
        // Add students from list
        studentList.forEach(student => {
            this.addStudentToGrid(student);
        });
    }
    
    addStudent(studentInfo) {
        Utils.log(`Adding student: ${studentInfo.name}`);
        this.addStudentToGrid(studentInfo);
    }
    
    addStudentToGrid(studentInfo) {
        // Store student info
        this.students.set(studentInfo.socketId, {
            ...studentInfo,
            slotNumber: null,
            lastFrameTime: null,
            canvas: null,
            context: null,
            gazeData: null,
            gazeHistory: studentInfo.gazeHistory || []
        });
        
        // Find available slot
        const availableSlot = this.findAvailableSlot();
        if (availableSlot) {
            this.assignStudentToSlot(studentInfo.socketId, availableSlot);
        } else {
            Utils.log(`No available slots for student: ${studentInfo.name}`, 'warn');
            Utils.showNotification(`No available slots for ${studentInfo.name}`, 'warning');
        }
    }
    
    removeStudent(studentInfo) {
        Utils.log(`Removing student: ${studentInfo.name}`);
        
        const student = this.students.get(studentInfo.socketId);
        if (student && student.slotNumber) {
            this.clearSlot(student.slotNumber);
            this.slots.delete(student.slotNumber);
        }
        
        this.students.delete(studentInfo.socketId);
        this.gazeAlerts.delete(studentInfo.studentId);
        
        // If this was the student in detail view, close detail view
        if (this.currentDetailStudent === studentInfo.socketId) {
            this.hideDetailView();
        }
    }
    
    findAvailableSlot() {
        for (let i = 1; i <= this.maxSlots; i++) {
            if (!this.slots.has(i)) {
                return i;
            }
        }
        return null;
    }
    
    assignStudentToSlot(studentSocketId, slotNumber) {
        const student = this.students.get(studentSocketId);
        if (!student) return;
        
        // Update student data
        student.slotNumber = slotNumber;
        this.slots.set(slotNumber, studentSocketId);
        
        // Get slot element
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        // Create canvas for video display
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.className = 'student-video';
        
        // Store canvas reference
        student.canvas = canvas;
        student.context = context;
        
        // Create video area (completely clean - no overlays)
        const videoArea = document.createElement('div');
        videoArea.className = 'video-area';
        videoArea.appendChild(canvas);
        
        // Add click handler for detail view
        videoArea.addEventListener('click', () => {
            this.showDetailView(studentSocketId);
        });
        
        // Add hover effect
        videoArea.style.cursor = 'pointer';
        videoArea.title = `Click to view ${student.name} in detail`;
        
        // Create student info overlay (minimal - just for name in corner)
        const overlay = document.createElement('div');
        overlay.className = 'student-info';
        overlay.innerHTML = `
            <div class="student-name">${student.name}</div>
        `;
        videoArea.appendChild(overlay);
        
        // Create info area below video
        const infoArea = document.createElement('div');
        infoArea.className = 'info-area';
        
        // Add connection status to info area
        const statusDiv = document.createElement('div');
        statusDiv.className = 'connection-status';
        statusDiv.innerHTML = `
            <span class="status-indicator">🟢</span>
            <span class="status-text">Connected</span>
        `;
        infoArea.appendChild(statusDiv);
        
        // Create gaze indicator in info area
        if (this.gazeTrackingEnabled) {
            const gazeIndicator = document.createElement('div');
            gazeIndicator.className = 'gaze-indicator';
            gazeIndicator.innerHTML = `
                <div class="gaze-direction">👀 Waiting...</div>
                <div class="gaze-confidence">-</div>
            `;
            gazeIndicator.style.display = 'block';
            infoArea.appendChild(gazeIndicator);
        }
        
        // Create alert area in info area (NOT overlaying video)
        const alertArea = document.createElement('div');
        alertArea.className = 'alert-area hidden';
        alertArea.innerHTML = `
            <div class="alert-content">
                <span class="alert-icon">⚠️</span>
                <span class="alert-message"></span>
            </div>
        `;
        infoArea.appendChild(alertArea);
        
        // Update slot content with new structure
        slotElement.className = 'student-slot active';
        slotElement.innerHTML = '';
        
        const slotContent = document.createElement('div');
        slotContent.className = 'slot-content';
        slotContent.appendChild(videoArea);
        slotContent.appendChild(infoArea);
        
        slotElement.appendChild(slotContent);
        
        Utils.log(`Student ${student.name} assigned to slot ${slotNumber}`);
    }
    
    updateStudentFrame(frameData) {
        const student = this.students.get(frameData.studentSocketId);
        if (!student || !student.canvas || !student.context) {
            return;
        }
        
        // Update last frame time
        student.lastFrameTime = new Date(frameData.timestamp);
        
        // Create image from frame data
        const img = new Image();
        img.onload = () => {
            try {
                // Set canvas size to match image
                student.canvas.width = frameData.frameData.width;
                student.canvas.height = frameData.frameData.height;
                
                // Draw image to canvas
                student.context.drawImage(img, 0, 0);
                
                // Update connection indicator
                this.updateConnectionIndicator(student.slotNumber, 'good');
                
                // If this is the student in detail view, update detail video
                if (this.currentDetailStudent === frameData.studentSocketId && this.detailContext) {
                    this.detailView.video.width = frameData.frameData.width;
                    this.detailView.video.height = frameData.frameData.height;
                    this.detailContext.drawImage(img, 0, 0);
                    
                    // Update detail view connection status
                    this.updateDetailConnectionStatus(student);
                }
                
            } catch (error) {
                Utils.log(`Error drawing frame for ${student.name}: ${error.message}`, 'error');
                this.updateConnectionIndicator(student.slotNumber, 'poor');
            }
        };
        
        img.onerror = () => {
            Utils.log(`Error loading frame for ${student.name}`, 'error');
            this.updateConnectionIndicator(student.slotNumber, 'poor');
        };
        
        img.src = frameData.frameData.dataUrl;
    }
    
    // Show student detail view
    showDetailView(studentSocketId) {
        const student = this.students.get(studentSocketId);
        if (!student || !this.detailView.container) {
            Utils.log('Cannot show detail view: student not found', 'error');
            return;
        }
        
        this.currentDetailStudent = studentSocketId;
        
        // Setup detail video canvas
        if (!this.detailContext) {
            this.detailContext = this.detailView.video.getContext('2d');
        }
        
        // Update detail view with student info
        this.updateDetailViewInfo(student);
        
        // Show detail view
        this.detailView.container.classList.remove('hidden');
        
        // Hide main grid
        document.querySelector('.teacher-content').style.display = 'none';
        
        // Dispatch event for activity tracking
        const event = new CustomEvent('studentDetailViewShown', {
            detail: { studentName: student.name, studentId: student.studentId }
        });
        document.dispatchEvent(event);
        
        Utils.log(`Showing detail view for ${student.name}`);
    }
    
    // Hide student detail view
    hideDetailView() {
        if (!this.detailView.container) return;
        
        // Hide detail view
        this.detailView.container.classList.add('hidden');
        
        // Show main grid
        document.querySelector('.teacher-content').style.display = 'grid';
        
        // Dispatch event for activity tracking
        const event = new CustomEvent('studentDetailViewHidden', {
            detail: { timestamp: new Date().toISOString() }
        });
        document.dispatchEvent(event);
        
        this.currentDetailStudent = null;
        
        Utils.log('Detail view hidden');
    }
    
    // Toggle detail view fullscreen
    toggleDetailFullscreen() {
        if (!document.fullscreenElement) {
            if (this.detailView.container.requestFullscreen) {
                this.detailView.container.requestFullscreen();
            } else if (this.detailView.container.webkitRequestFullscreen) {
                this.detailView.container.webkitRequestFullscreen();
            } else if (this.detailView.container.mozRequestFullScreen) {
                this.detailView.container.mozRequestFullScreen();
            }
            this.detailView.fullscreenBtn.textContent = 'Exit Fullscreen';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
            this.detailView.fullscreenBtn.textContent = 'Fullscreen';
        }
    }
    
    // Update detail view with student information
    updateDetailViewInfo(student) {
        if (!this.detailView.studentName) return;
        
        // Update student name
        this.detailView.studentName.textContent = student.name;
        this.detailView.studentNameOverlay.textContent = student.name;
        
        // Update connection status
        this.updateDetailConnectionStatus(student);
        
        // Update gaze info
        this.updateDetailGazeInfo(student);
        
        // Update alerts
        this.updateDetailAlerts(student);
        
        // Update other students alerts
        this.updateOtherStudentsAlerts();
    }
    
    // Update detail view connection status
    updateDetailConnectionStatus(student) {
        if (!this.detailView.connectionStatus) return;
        
        const now = Date.now();
        const timeSinceLastFrame = student.lastFrameTime ? 
            now - student.lastFrameTime.getTime() : Infinity;
        
        let status = 'Connected';
        let statusClass = 'status-connected';
        let indicatorClass = '';
        
        if (timeSinceLastFrame > 10000) {
            status = 'Poor Connection';
            statusClass = 'status-disconnected';
            indicatorClass = 'poor';
        } else if (timeSinceLastFrame > 5000) {
            status = 'Weak Connection';
            statusClass = 'status-connecting';
            indicatorClass = 'weak';
        }
        
        this.detailView.connectionStatus.textContent = status;
        this.detailView.connectionStatus.className = statusClass;
        this.detailView.connectionIndicator.className = `detail-connection-indicator ${indicatorClass}`;
        
        // Update last frame time
        if (student.lastFrameTime) {
            const timeAgo = Math.round(timeSinceLastFrame / 1000);
            this.detailView.lastFrame.textContent = timeAgo < 60 ? 
                `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;
        } else {
            this.detailView.lastFrame.textContent = 'No data';
        }
    }
    
    // Update detail view gaze information
    updateDetailGazeInfo(student) {
        if (!this.detailView.gazeDirection) return;
        
        const currentGaze = this.detailView.gazeDirection.parentElement;
        
        if (student.gazeData) {
            // Update current gaze
            const directionMap = {
                'left': '👈 Looking Left',
                'right': '👉 Looking Right',
                'center': '👀 Looking at Screen',
                'blinking': '😴 Blinking',
                'unknown': '❓ No Detection',
                'error': '❌ Detection Error'
            };
            
            this.detailView.gazeDirection.textContent = 
                directionMap[student.gazeData.gaze_direction] || '❓ Unknown';
            
            const confidence = Math.round((student.gazeData.confidence || 0) * 100);
            this.detailView.gazeConfidence.textContent = `Confidence: ${confidence}%`;
            
            // Update gaze direction styling
            currentGaze.className = `current-gaze gaze-${student.gazeData.gaze_direction}`;
        } else {
            this.detailView.gazeDirection.textContent = '👀 Waiting for data...';
            this.detailView.gazeConfidence.textContent = 'Confidence: -';
            currentGaze.className = 'current-gaze';
        }
        
        // Update gaze history
        this.updateGazeHistory(student);
    }
    
    // Update gaze history in detail view
    updateGazeHistory(student) {
        if (!this.detailView.gazeHistory) return;
        
        const history = student.gazeHistory || [];
        
        if (history.length === 0) {
            this.detailView.gazeHistory.innerHTML = '<div class="no-alerts">No gaze data yet</div>';
            return;
        }
        
        const historyHTML = history.slice(-10).reverse().map(item => {
            const time = new Date(item.timestamp);
            const timeStr = Utils.formatTime(time);
            const direction = item.direction.charAt(0).toUpperCase() + item.direction.slice(1);
            
            return `
                <div class="gaze-history-item">
                    <span class="gaze-history-direction">${direction}</span>
                    <span class="gaze-history-time">${timeStr}</span>
                </div>
            `;
        }).join('');
        
        this.detailView.gazeHistory.innerHTML = historyHTML;
    }
    
    // Update detail view alerts
    updateDetailAlerts(student) {
        if (!this.detailView.alerts) return;
        
        const studentId = student.studentId;
        const alert = this.gazeAlerts.get(studentId);
        
        if (!alert) {
            this.detailView.alerts.innerHTML = '<div class="no-alerts">No active alerts</div>';
            return;
        }
        
        const alertTime = new Date(alert.timestamp);
        const timeStr = Utils.formatTime(alertTime);
        
        this.detailView.alerts.innerHTML = `
            <div class="alert-item ${alert.alert.severity}">
                <div class="alert-message">${alert.alert.message}</div>
                <div class="alert-time">${timeStr}</div>
            </div>
        `;
    }
    
    // Update other students alerts
    updateOtherStudentsAlerts() {
        if (!this.detailView.otherStudentsAlerts) return;
        
        const otherAlerts = Array.from(this.otherStudentAlerts.values())
            .filter(alert => {
                const student = this.students.get(this.currentDetailStudent);
                return student && alert.studentId !== student.studentId;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5); // Show last 5 alerts
        
        if (otherAlerts.length === 0) {
            this.detailView.otherStudentsAlerts.innerHTML = 
                '<div class="no-alerts">No alerts from other students</div>';
            return;
        }
        
        const alertsHTML = otherAlerts.map(alert => {
            const time = new Date(alert.timestamp);
            const timeStr = Utils.formatTime(time);
            
            return `
                <div class="other-student-alert ${alert.alert.severity}">
                    <div class="other-alert-content">
                        <div class="other-alert-student">${alert.studentName}</div>
                        <div class="other-alert-message">${alert.alert.message}</div>
                    </div>
                    <div class="other-alert-time">${timeStr}</div>
                </div>
            `;
        }).join('');
        
        this.detailView.otherStudentsAlerts.innerHTML = alertsHTML;
    }
    
    // Handle gaze tracking status
    handleGazeTrackingStatus(status) {
        this.gazeTrackingEnabled = status.enabled;
        Utils.log(`Gaze tracking ${status.enabled ? 'enabled' : 'disabled'}`);
        
        // Update UI for all existing students
        this.students.forEach(student => {
            if (student.slotNumber) {
                this.updateGazeIndicatorVisibility(student.slotNumber);
            }
        });
    }
    
    // Update student gaze data
    updateStudentGaze(gazeData) {
        const student = this.students.get(gazeData.studentSocketId);
        if (!student || !student.slotNumber) return;
        
        // Store gaze data
        student.gazeData = gazeData.gazeData;
        
        // Update gaze history
        if (!student.gazeHistory) student.gazeHistory = [];
        student.gazeHistory.push({
            timestamp: gazeData.timestamp,
            direction: gazeData.gazeData.gaze_direction,
            confidence: gazeData.gazeData.confidence
        });
        
        // Keep only last 10 results
        if (student.gazeHistory.length > 10) {
            student.gazeHistory.shift();
        }
        
        // Update gaze indicator in grid
        this.updateGazeIndicator(student.slotNumber, gazeData.gazeData);
        
        // If this is the student in detail view, update detail gaze info
        if (this.currentDetailStudent === gazeData.studentSocketId) {
            this.updateDetailGazeInfo(student);
        }
    }
    
    // Handle gaze alerts
    handleGazeAlert(alertData) {
        this.gazeAlerts.set(alertData.studentId, alertData);
        
        // Store in other students alerts for detail view
        this.otherStudentAlerts.set(
            `${alertData.studentId}-${Date.now()}`, 
            alertData
        );
        
        // Clean old alerts (keep last 20)
        if (this.otherStudentAlerts.size > 20) {
            const oldest = Array.from(this.otherStudentAlerts.keys())[0];
            this.otherStudentAlerts.delete(oldest);
        }
        
        const student = Array.from(this.students.values())
            .find(s => s.studentId === alertData.studentId);
        
        if (student && student.slotNumber) {
            this.showGazeAlert(student.slotNumber, alertData.alert);
        }
        
        // Update detail view if currently showing any student
        if (this.currentDetailStudent) {
            const currentStudent = this.students.get(this.currentDetailStudent);
            if (currentStudent) {
                // Update detail alerts if this is the current student
                if (currentStudent.studentId === alertData.studentId) {
                    this.updateDetailAlerts(currentStudent);
                }
                // Always update other students alerts
                this.updateOtherStudentsAlerts();
            }
        }
        
        // Log alert
        Utils.log(`Gaze alert for ${alertData.studentName}: ${alertData.alert.message}`, 'warn');
        Utils.showNotification(alertData.alert.message, alertData.alert.severity);
    }
    
    // Update gaze indicator
    updateGazeIndicator(slotNumber, gazeData) {
        if (!this.gazeTrackingEnabled) return;
        
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const gazeIndicator = slotElement.querySelector('.gaze-indicator');
        if (!gazeIndicator) return;
        
        const directionElement = gazeIndicator.querySelector('.gaze-direction');
        const confidenceElement = gazeIndicator.querySelector('.gaze-confidence');
        
        if (directionElement && confidenceElement) {
            // Update direction with emoji and text
            const directionMap = {
                'left': '👈 Looking Left',
                'right': '👉 Looking Right', 
                'center': '👀 Looking Center',
                'blinking': '😴 Blinking',
                'unknown': '❓ No Detection',
                'error': '❌ Error'
            };
            
            directionElement.textContent = directionMap[gazeData.gaze_direction] || '❓ Unknown';
            
            // Update confidence
            const confidence = Math.round((gazeData.confidence || 0) * 100);
            confidenceElement.textContent = `Confidence: ${confidence}%`;
            
            // Add visual styling based on gaze direction
            gazeIndicator.className = 'gaze-indicator';
            gazeIndicator.classList.add(`gaze-${gazeData.gaze_direction}`);
        }
    }
    
    // Show/hide gaze indicator based on tracking status
    updateGazeIndicatorVisibility(slotNumber) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const gazeIndicator = slotElement.querySelector('.gaze-indicator');
        if (gazeIndicator) {
            gazeIndicator.style.display = this.gazeTrackingEnabled ? 'block' : 'none';
        }
    }
    
    // Show gaze alert overlay
    showGazeAlert(slotNumber, alert) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const alertOverlay = slotElement.querySelector('.alert-overlay');
        const alertMessage = slotElement.querySelector('.alert-message');
        
        if (alertOverlay && alertMessage) {
            alertMessage.textContent = alert.message;
            alertOverlay.className = `alert-overlay ${alert.severity}`;
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                alertOverlay.classList.add('hidden');
            }, 5000);
        }
        
        // Add alert styling to slot
        slotElement.classList.add('has-alert', `alert-${alert.severity}`);
        
        // Remove alert styling after 10 seconds
        setTimeout(() => {
            slotElement.classList.remove('has-alert', `alert-${alert.severity}`);
        }, 10000);
    }
    
    updateConnectionIndicator(slotNumber, quality) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const indicator = slotElement.querySelector('.connection-indicator');
        if (!indicator) return;
        
        // Remove existing quality classes
        indicator.classList.remove('weak', 'poor');
        
        // Add new quality class
        if (quality === 'weak') {
            indicator.classList.add('weak');
        } else if (quality === 'poor') {
            indicator.classList.add('poor');
        }
        // 'good' quality has no additional class (default green)
    }
    
    clearSlot(slotNumber) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        slotElement.className = 'student-slot empty';
        slotElement.innerHTML = `
            <div class="slot-content">
                <div class="empty-message">
                    <div class="slot-number">${slotNumber}</div>
                    <div class="waiting-text">Waiting for student...</div>
                </div>
            </div>
        `;
    }
    
    clearAllSlots() {
        this.slots.clear();
        for (let i = 1; i <= this.maxSlots; i++) {
            this.clearSlot(i);
        }
    }
    
    reassignStudents() {
        // Reassign existing students to available slots
        const studentsToReassign = Array.from(this.students.values())
            .filter(student => student.slotNumber && student.slotNumber > this.maxSlots);
        
        studentsToReassign.forEach(student => {
            // Clear old slot assignment
            if (student.slotNumber) {
                this.slots.delete(student.slotNumber);
                student.slotNumber = null;
            }
            
            // Find new slot
            const newSlot = this.findAvailableSlot();
            if (newSlot) {
                this.assignStudentToSlot(student.socketId, newSlot);
            }
        });
    }
    
    // Monitor connection quality
    startConnectionMonitoring() {
        setInterval(() => {
            const now = Date.now();
            this.students.forEach(student => {
                if (student.slotNumber && student.lastFrameTime) {
                    const timeSinceLastFrame = now - student.lastFrameTime.getTime();
                    
                    if (timeSinceLastFrame > 10000) {
                        // No frame for 10 seconds - poor connection
                        this.updateConnectionIndicator(student.slotNumber, 'poor');
                    } else if (timeSinceLastFrame > 5000) {
                        // No frame for 5 seconds - weak connection
                        this.updateConnectionIndicator(student.slotNumber, 'weak');
                    } else {
                        // Recent frame - good connection
                        this.updateConnectionIndicator(student.slotNumber, 'good');
                    }
                }
            });
        }, 3000); // Check every 3 seconds
    }
    
    // Get gaze statistics for all students
    getGazeStatistics() {
        const stats = {
            totalStudents: this.students.size,
            studentsWithGazeData: 0,
            gazeDirections: {
                center: 0,
                left: 0,
                right: 0,
                blinking: 0,
                unknown: 0
            },
            averageConfidence: 0,
            activeAlerts: this.gazeAlerts.size
        };
        
        let totalConfidence = 0;
        let confidenceCount = 0;
        
        this.students.forEach(student => {
            if (student.gazeData) {
                stats.studentsWithGazeData++;
                
                const direction = student.gazeData.gaze_direction;
                if (stats.gazeDirections.hasOwnProperty(direction)) {
                    stats.gazeDirections[direction]++;
                }
                
                if (student.gazeData.confidence) {
                    totalConfidence += student.gazeData.confidence;
                    confidenceCount++;
                }
            }
        });
        
        if (confidenceCount > 0) {
            stats.averageConfidence = totalConfidence / confidenceCount;
        }
        
        return stats;
    }
    
    getGridState() {
        return {
            currentGridSize: this.currentGridSize,
            maxSlots: this.maxSlots,
            studentCount: this.students.size,
            occupiedSlots: this.slots.size,
            gazeTrackingEnabled: this.gazeTrackingEnabled,
            gazeAlerts: this.gazeAlerts.size,
            detailViewActive: !!this.currentDetailStudent,
            currentDetailStudent: this.currentDetailStudent,
            students: Array.from(this.students.values()).map(student => ({
                name: student.name,
                slotNumber: student.slotNumber,
                lastFrameTime: student.lastFrameTime,
                gazeDirection: student.gazeData?.gaze_direction,
                gazeConfidence: student.gazeData?.confidence
            }))
        };
    }
}

// Create global instance
window.studentGrid = new StudentGrid();
*/

// Enhanced Student Grid Manager with Gaze Tracking and AI Detection
class StudentGrid {
    constructor() {
        this.gridContainer = document.getElementById('studentsGrid');
        this.gridSizeSelect = document.getElementById('gridSize');
        
        this.students = new Map(); // socketId -> student data
        this.slots = new Map(); // slotNumber -> student socketId
        this.maxSlots = 10;
        this.currentGridSize = '2x5';
        
        // Gaze tracking state
        this.gazeTrackingEnabled = false;
        this.gazeAlerts = new Map(); // studentId -> alert data
        
        // AI detection state
        this.aiDetectionEnabled = false;
        this.aiDetectionAlerts = new Map(); // studentId -> alert data
        
        // Detail view references
        this.detailView = {
            container: document.getElementById('studentDetailView'),
            studentName: document.getElementById('detailStudentName'),
            studentNameOverlay: document.getElementById('detailStudentNameOverlay'),
            video: document.getElementById('detailStudentVideo'),
            connectionStatus: document.getElementById('detailConnectionStatus'),
            connectionIndicator: document.getElementById('detailConnectionIndicator'),
            lastFrame: document.getElementById('detailLastFrame'),
            gazeDirection: document.getElementById('detailGazeDirection'),
            gazeConfidence: document.getElementById('detailGazeConfidence'),
            gazeHistory: document.getElementById('detailGazeHistory'),
            // NEW: AI detection detail elements
            aiDetection: document.getElementById('detailAIDetection'),
            aiConfidence: document.getElementById('detailAIConfidence'),
            aiHistory: document.getElementById('detailAIHistory'),
            alerts: document.getElementById('detailAlerts'),
            otherStudentsAlerts: document.getElementById('otherStudentsAlerts'),
            backBtn: document.getElementById('backToGridBtn'),
            fullscreenBtn: document.getElementById('detailFullscreenBtn')
        };
        
        this.currentDetailStudent = null;
        this.detailContext = null;
        this.otherStudentAlerts = new Map(); // Track alerts from other students
        
        this.setupEventListeners();
        this.initializeGrid();
    }
    
    setupEventListeners() {
        // Grid size change
        this.gridSizeSelect.addEventListener('change', (e) => {
            this.changeGridSize(e.target.value);
        });
        
        // Listen for student events
        document.addEventListener('studentListReceived', (event) => {
            this.handleStudentList(event.detail);
        });
        
        document.addEventListener('studentJoined', (event) => {
            this.addStudent(event.detail);
        });
        
        document.addEventListener('studentLeft', (event) => {
            this.removeStudent(event.detail);
        });
        
        document.addEventListener('studentVideoFrame', (event) => {
            this.updateStudentFrame(event.detail);
        });
        
        // Gaze tracking events
        document.addEventListener('gazeTrackingStatus', (event) => {
            this.handleGazeTrackingStatus(event.detail);
        });
        
        document.addEventListener('studentGazeUpdate', (event) => {
            this.updateStudentGaze(event.detail);
        });
        
        document.addEventListener('gazeAlert', (event) => {
            this.handleGazeAlert(event.detail);
        });
        
        // NEW: AI detection events
        document.addEventListener('aiDetectionStatus', (event) => {
            this.handleAIDetectionStatus(event.detail);
        });
        
        document.addEventListener('studentAIDetectionUpdate', (event) => {
            this.updateStudentAIDetection(event.detail);
        });
        
        document.addEventListener('aiDetectionAlert', (event) => {
            this.handleAIDetectionAlert(event.detail);
        });
        
        // Detail view event listeners
        if (this.detailView.backBtn) {
            this.detailView.backBtn.addEventListener('click', () => {
                this.hideDetailView();
            });
        }
        
        if (this.detailView.fullscreenBtn) {
            this.detailView.fullscreenBtn.addEventListener('click', () => {
                this.toggleDetailFullscreen();
            });
        }
        
        // Add keyboard handler for escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.currentDetailStudent) {
                this.hideDetailView();
            }
        });
        
        // Handle fullscreen change for detail view
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.detailView.fullscreenBtn) {
                this.detailView.fullscreenBtn.textContent = 'Fullscreen';
            }
        });
    }
    
    initializeGrid() {
        // Set initial grid size
        this.updateGridLayout();
        Utils.log('Student grid initialized');
    }
    
    changeGridSize(newSize) {
        this.currentGridSize = newSize;
        this.updateGridLayout();
        this.updateMaxSlots();
        Utils.log(`Grid size changed to: ${newSize}`);
    }
    
    updateGridLayout() {
        // Remove existing grid class
        this.gridContainer.className = this.gridContainer.className
            .replace(/grid-\w+/g, '');
        
        // Add new grid class
        this.gridContainer.classList.add('students-grid', `grid-${this.currentGridSize}`);
    }
    
    updateMaxSlots() {
        const sizeMap = {
            '2x2': 4,
            '2x3': 6,
            '2x4': 8,
            '2x5': 10,
            '3x4': 12
        };
        
        const newMaxSlots = sizeMap[this.currentGridSize] || 10;
        
        if (newMaxSlots !== this.maxSlots) {
            this.maxSlots = newMaxSlots;
            this.regenerateSlots();
        }
    }
    
    regenerateSlots() {
        // Clear existing slots
        this.gridContainer.innerHTML = '';
        this.slots.clear();
        
        // Create new slots
        for (let i = 1; i <= this.maxSlots; i++) {
            this.createSlot(i);
        }
        
        // Reassign students to slots
        this.reassignStudents();
    }
    
    createSlot(slotNumber) {
        const slot = document.createElement('div');
        slot.className = 'student-slot empty';
        slot.dataset.slot = slotNumber;
        
        slot.innerHTML = `
            <div class="slot-content">
                <div class="empty-message">
                    <div class="slot-number">${slotNumber}</div>
                    <div class="waiting-text">Waiting for student...</div>
                </div>
            </div>
        `;
        
        this.gridContainer.appendChild(slot);
    }
    
    handleStudentList(studentList) {
        Utils.log(`Handling student list: ${studentList.length} students`);
        
        // Clear current students
        this.students.clear();
        this.clearAllSlots();
        
        // Add students from list
        studentList.forEach(student => {
            this.addStudentToGrid(student);
        });
    }
    
    addStudent(studentInfo) {
        Utils.log(`Adding student: ${studentInfo.name}`);
        this.addStudentToGrid(studentInfo);
    }
    
    addStudentToGrid(studentInfo) {
        // Store student info
        this.students.set(studentInfo.socketId, {
            ...studentInfo,
            slotNumber: null,
            lastFrameTime: null,
            canvas: null,
            context: null,
            gazeData: null,
            gazeHistory: studentInfo.gazeHistory || [],
            // NEW: AI detection properties
            aiDetectionData: null,
            aiDetectionHistory: studentInfo.aiDetectionHistory || []
        });
        
        // Find available slot
        const availableSlot = this.findAvailableSlot();
        if (availableSlot) {
            this.assignStudentToSlot(studentInfo.socketId, availableSlot);
        } else {
            Utils.log(`No available slots for student: ${studentInfo.name}`, 'warn');
            Utils.showNotification(`No available slots for ${studentInfo.name}`, 'warning');
        }
    }
    
    removeStudent(studentInfo) {
        Utils.log(`Removing student: ${studentInfo.name}`);
        
        const student = this.students.get(studentInfo.socketId);
        if (student && student.slotNumber) {
            this.clearSlot(student.slotNumber);
            this.slots.delete(student.slotNumber);
        }
        
        this.students.delete(studentInfo.socketId);
        this.gazeAlerts.delete(studentInfo.studentId);
        this.aiDetectionAlerts.delete(studentInfo.studentId); // NEW: Clear AI detection alerts
        
        // If this was the student in detail view, close detail view
        if (this.currentDetailStudent === studentInfo.socketId) {
            this.hideDetailView();
        }
    }
    
    findAvailableSlot() {
        for (let i = 1; i <= this.maxSlots; i++) {
            if (!this.slots.has(i)) {
                return i;
            }
        }
        return null;
    }
    
    assignStudentToSlot(studentSocketId, slotNumber) {
        const student = this.students.get(studentSocketId);
        if (!student) return;
        
        // Update student data
        student.slotNumber = slotNumber;
        this.slots.set(slotNumber, studentSocketId);
        
        // Get slot element
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        // Create canvas for video display
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.className = 'student-video';
        
        // Store canvas reference
        student.canvas = canvas;
        student.context = context;
        
        // Create video area (completely clean - no overlays)
        const videoArea = document.createElement('div');
        videoArea.className = 'video-area';
        videoArea.appendChild(canvas);
        
        // Add click handler for detail view
        videoArea.addEventListener('click', () => {
            this.showDetailView(studentSocketId);
        });
        
        // Add hover effect
        videoArea.style.cursor = 'pointer';
        videoArea.title = `Click to view ${student.name} in detail`;
        
        // Create student info overlay (minimal - just for name in corner)
        const overlay = document.createElement('div');
        overlay.className = 'student-info';
        overlay.innerHTML = `
            <div class="student-name">${student.name}</div>
        `;
        videoArea.appendChild(overlay);
        
        // Create info area below video
        const infoArea = document.createElement('div');
        infoArea.className = 'info-area';
        
        // Add connection status to info area
        const statusDiv = document.createElement('div');
        statusDiv.className = 'connection-status';
        statusDiv.innerHTML = `
            <span class="status-indicator">🟢</span>
            <span class="status-text">Connected</span>
        `;
        infoArea.appendChild(statusDiv);
        
        // Create gaze indicator in info area
        if (this.gazeTrackingEnabled) {
            const gazeIndicator = document.createElement('div');
            gazeIndicator.className = 'gaze-indicator';
            gazeIndicator.innerHTML = `
                <div class="gaze-direction">👀 Waiting...</div>
                <div class="gaze-confidence">-</div>
            `;
            gazeIndicator.style.display = 'block';
            infoArea.appendChild(gazeIndicator);
        }
        
        // NEW: Create AI detection indicator in info area
        if (this.aiDetectionEnabled) {
            const aiIndicator = document.createElement('div');
            aiIndicator.className = 'ai-indicator';
            aiIndicator.innerHTML = `
                <div class="ai-detection">🤖 Waiting...</div>
                <div class="ai-confidence">-</div>
            `;
            aiIndicator.style.display = 'block';
            infoArea.appendChild(aiIndicator);
        }
        
        // Create alert area in info area (NOT overlaying video)
        const alertArea = document.createElement('div');
        alertArea.className = 'alert-area hidden';
        alertArea.innerHTML = `
            <div class="alert-content">
                <span class="alert-icon">⚠️</span>
                <span class="alert-message"></span>
            </div>
        `;
        infoArea.appendChild(alertArea);
        
        // Update slot content with new structure
        slotElement.className = 'student-slot active';
        slotElement.innerHTML = '';
        
        const slotContent = document.createElement('div');
        slotContent.className = 'slot-content';
        slotContent.appendChild(videoArea);
        slotContent.appendChild(infoArea);
        
        slotElement.appendChild(slotContent);
        
        Utils.log(`Student ${student.name} assigned to slot ${slotNumber}`);
    }
    
    updateStudentFrame(frameData) {
        const student = this.students.get(frameData.studentSocketId);
        if (!student || !student.canvas || !student.context) {
            return;
        }
        
        // Update last frame time
        student.lastFrameTime = new Date(frameData.timestamp);
        
        // Create image from frame data
        const img = new Image();
        img.onload = () => {
            try {
                // Set canvas size to match image
                student.canvas.width = frameData.frameData.width;
                student.canvas.height = frameData.frameData.height;
                
                // Draw image to canvas
                student.context.drawImage(img, 0, 0);
                
                // Update connection indicator
                this.updateConnectionIndicator(student.slotNumber, 'good');
                
                // If this is the student in detail view, update detail video
                if (this.currentDetailStudent === frameData.studentSocketId && this.detailContext) {
                    this.detailView.video.width = frameData.frameData.width;
                    this.detailView.video.height = frameData.frameData.height;
                    this.detailContext.drawImage(img, 0, 0);
                    
                    // Update detail view connection status
                    this.updateDetailConnectionStatus(student);
                }
                
            } catch (error) {
                Utils.log(`Error drawing frame for ${student.name}: ${error.message}`, 'error');
                this.updateConnectionIndicator(student.slotNumber, 'poor');
            }
        };
        
        img.onerror = () => {
            Utils.log(`Error loading frame for ${student.name}`, 'error');
            this.updateConnectionIndicator(student.slotNumber, 'poor');
        };
        
        img.src = frameData.frameData.dataUrl;
    }
    
    // Handle gaze tracking status
    handleGazeTrackingStatus(status) {
        this.gazeTrackingEnabled = status.enabled;
        Utils.log(`Gaze tracking ${status.enabled ? 'enabled' : 'disabled'}`);
        
        // Update UI for all existing students
        this.students.forEach(student => {
            if (student.slotNumber) {
                this.updateGazeIndicatorVisibility(student.slotNumber);
            }
        });
    }
    
    // NEW: Handle AI detection status
    handleAIDetectionStatus(status) {
        this.aiDetectionEnabled = status.enabled;
        Utils.log(`AI detection ${status.enabled ? 'enabled' : 'disabled'}`);
        
        // Update UI for all existing students
        this.students.forEach(student => {
            if (student.slotNumber) {
                this.updateAIIndicatorVisibility(student.slotNumber);
            }
        });
    }
    
    // Update student gaze data
    updateStudentGaze(gazeData) {
        const student = this.students.get(gazeData.studentSocketId);
        if (!student || !student.slotNumber) return;
        
        // Store gaze data
        student.gazeData = gazeData.gazeData;
        
        // Update gaze history
        if (!student.gazeHistory) student.gazeHistory = [];
        student.gazeHistory.push({
            timestamp: gazeData.timestamp,
            direction: gazeData.gazeData.gaze_direction,
            confidence: gazeData.gazeData.confidence
        });
        
        // Keep only last 10 results
        if (student.gazeHistory.length > 10) {
            student.gazeHistory.shift();
        }
        
        // Update gaze indicator in grid
        this.updateGazeIndicator(student.slotNumber, gazeData.gazeData);
        
        // If this is the student in detail view, update detail gaze info
        if (this.currentDetailStudent === gazeData.studentSocketId) {
            this.updateDetailGazeInfo(student);
        }
    }
    
    // NEW: Update student AI detection data
    updateStudentAIDetection(aiDetectionData) {
        const student = this.students.get(aiDetectionData.studentSocketId);
        if (!student || !student.slotNumber) return;
        
        // Store AI detection data
        student.aiDetectionData = aiDetectionData.aiDetectionData;
        
        // Update AI detection history
        if (!student.aiDetectionHistory) student.aiDetectionHistory = [];
        student.aiDetectionHistory.push({
            timestamp: aiDetectionData.timestamp,
            detection: aiDetectionData.aiDetectionData.ai_detection,
            confidence: aiDetectionData.aiDetectionData.confidence
        });
        
        // Keep only last 10 results
        if (student.aiDetectionHistory.length > 10) {
            student.aiDetectionHistory.shift();
        }
        
        // Update AI indicator in grid
        this.updateAIIndicator(student.slotNumber, aiDetectionData.aiDetectionData);
        
        // If this is the student in detail view, update detail AI info
        if (this.currentDetailStudent === aiDetectionData.studentSocketId) {
            this.updateDetailAIInfo(student);
        }
    }
    
    // Handle gaze alerts
    handleGazeAlert(alertData) {
        this.gazeAlerts.set(alertData.studentId, alertData);
        
        // Store in other students alerts for detail view
        this.otherStudentAlerts.set(
            `${alertData.studentId}-${Date.now()}`, 
            alertData
        );
        
        this.processAlert(alertData, 'gaze');
    }
    
    // NEW: Handle AI detection alerts
    handleAIDetectionAlert(alertData) {
        this.aiDetectionAlerts.set(alertData.studentId, alertData);
        
        // Store in other students alerts for detail view
        this.otherStudentAlerts.set(
            `${alertData.studentId}-ai-${Date.now()}`, 
            alertData
        );
        
        this.processAlert(alertData, 'ai');
    }
    
    // Common alert processing method
    processAlert(alertData, type) {
        // Clean old alerts (keep last 20)
        if (this.otherStudentAlerts.size > 20) {
            const oldest = Array.from(this.otherStudentAlerts.keys())[0];
            this.otherStudentAlerts.delete(oldest);
        }
        
        const student = Array.from(this.students.values())
            .find(s => s.studentId === alertData.studentId);
        
        if (student && student.slotNumber) {
            if (type === 'gaze') {
                this.showGazeAlert(student.slotNumber, alertData.alert);
            } else if (type === 'ai') {
                this.showAIDetectionAlert(student.slotNumber, alertData.alert);
            }
        }
        
        // Update detail view if currently showing any student
        if (this.currentDetailStudent) {
            const currentStudent = this.students.get(this.currentDetailStudent);
            if (currentStudent) {
                // Update detail alerts if this is the current student
                if (currentStudent.studentId === alertData.studentId) {
                    this.updateDetailAlerts(currentStudent);
                }
                // Always update other students alerts
                this.updateOtherStudentsAlerts();
            }
        }
        
        // Log alert
        const emoji = type === 'gaze' ? '👀' : '🤖';
        Utils.log(`${type} alert for ${alertData.studentName}: ${alertData.alert.message}`, 'warn');
        Utils.showNotification(`${emoji} ${alertData.alert.message}`, alertData.alert.severity);
    }
    
    // Update gaze indicator
    updateGazeIndicator(slotNumber, gazeData) {
        if (!this.gazeTrackingEnabled) return;
        
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const gazeIndicator = slotElement.querySelector('.gaze-indicator');
        if (!gazeIndicator) return;
        
        const directionElement = gazeIndicator.querySelector('.gaze-direction');
        const confidenceElement = gazeIndicator.querySelector('.gaze-confidence');
        
        if (directionElement && confidenceElement) {
            // Update direction with emoji and text
            const directionMap = {
                'left': '👈 Looking Left',
                'right': '👉 Looking Right', 
                'center': '👀 Looking Center',
                'blinking': '😴 Blinking',
                'unknown': '❓ No Detection',
                'error': '❌ Error'
            };
            
            directionElement.textContent = directionMap[gazeData.gaze_direction] || '❓ Unknown';
            
            // Update confidence
            const confidence = Math.round((gazeData.confidence || 0) * 100);
            confidenceElement.textContent = `Confidence: ${confidence}%`;
            
            // Add visual styling based on gaze direction
            gazeIndicator.className = 'gaze-indicator';
            gazeIndicator.classList.add(`gaze-${gazeData.gaze_direction}`);
        }
    }
    
    // NEW: Update AI detection indicator
    updateAIIndicator(slotNumber, aiDetectionData) {
        if (!this.aiDetectionEnabled) return;
        
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const aiIndicator = slotElement.querySelector('.ai-indicator');
        if (!aiIndicator) return;
        
        const detectionElement = aiIndicator.querySelector('.ai-detection');
        const confidenceElement = aiIndicator.querySelector('.ai-confidence');
        
        if (detectionElement && confidenceElement) {
            // Update detection with emoji and text
            const detectionMap = {
                'real': '✅ Real Person',
                'fake': '🚨 AI Generated',
                'no_face': '👤 No Face',
                'error': '❌ Error'
            };
            
            detectionElement.textContent = detectionMap[aiDetectionData.ai_detection] || '❓ Unknown';
            
            // Update confidence
            const confidence = Math.round((aiDetectionData.confidence || 0) * 100);
            confidenceElement.textContent = `Confidence: ${confidence}%`;
            
            // Add visual styling based on AI detection result
            aiIndicator.className = 'ai-indicator';
            aiIndicator.classList.add(`ai-${aiDetectionData.ai_detection}`);
        }
    }
    
    // Show/hide gaze indicator based on tracking status
    updateGazeIndicatorVisibility(slotNumber) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const gazeIndicator = slotElement.querySelector('.gaze-indicator');
        if (gazeIndicator) {
            gazeIndicator.style.display = this.gazeTrackingEnabled ? 'block' : 'none';
        }
    }
    
    // NEW: Show/hide AI indicator based on detection status
    updateAIIndicatorVisibility(slotNumber) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const aiIndicator = slotElement.querySelector('.ai-indicator');
        if (aiIndicator) {
            aiIndicator.style.display = this.aiDetectionEnabled ? 'block' : 'none';
        }
    }
    
    // Show gaze alert overlay
    showGazeAlert(slotNumber, alert) {
        this.showAlert(slotNumber, alert, 'gaze');
    }
    
    // NEW: Show AI detection alert overlay
    showAIDetectionAlert(slotNumber, alert) {
        this.showAlert(slotNumber, alert, 'ai');
    }
    
    // Common alert display method
    showAlert(slotNumber, alert, type) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        // Add alert styling to slot
        slotElement.classList.add('has-alert', `alert-${alert.severity}`, `${type}-alert`);
        
        // Remove alert styling after 10 seconds
        setTimeout(() => {
            slotElement.classList.remove('has-alert', `alert-${alert.severity}`, `${type}-alert`);
        }, 10000);
    }
    
    updateConnectionIndicator(slotNumber, quality) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        const indicator = slotElement.querySelector('.connection-indicator');
        if (!indicator) return;
        
        // Remove existing quality classes
        indicator.classList.remove('weak', 'poor');
        
        // Add new quality class
        if (quality === 'weak') {
            indicator.classList.add('weak');
        } else if (quality === 'poor') {
            indicator.classList.add('poor');
        }
        // 'good' quality has no additional class (default green)
    }
    
    // Show student detail view
    showDetailView(studentSocketId) {
        const student = this.students.get(studentSocketId);
        if (!student || !this.detailView.container) {
            Utils.log('Cannot show detail view: student not found', 'error');
            return;
        }
        
        this.currentDetailStudent = studentSocketId;
        
        // Setup detail video canvas
        if (!this.detailContext) {
            this.detailContext = this.detailView.video.getContext('2d');
        }
        
        // Update detail view with student info
        this.updateDetailViewInfo(student);
        
        // Show detail view
        this.detailView.container.classList.remove('hidden');
        
        // Hide main grid
        document.querySelector('.teacher-content').style.display = 'none';
        
        // Dispatch event for activity tracking
        const event = new CustomEvent('studentDetailViewShown', {
            detail: { studentName: student.name, studentId: student.studentId }
        });
        document.dispatchEvent(event);
        
        Utils.log(`Showing detail view for ${student.name}`);
    }
    
    // Hide student detail view
    hideDetailView() {
        if (!this.detailView.container) return;
        
        // Hide detail view
        this.detailView.container.classList.add('hidden');
        
        // Show main grid
        document.querySelector('.teacher-content').style.display = 'grid';
        
        // Dispatch event for activity tracking
        const event = new CustomEvent('studentDetailViewHidden', {
            detail: { timestamp: new Date().toISOString() }
        });
        document.dispatchEvent(event);
        
        this.currentDetailStudent = null;
        
        Utils.log('Detail view hidden');
    }
    
    // Toggle detail view fullscreen
    toggleDetailFullscreen() {
        if (!document.fullscreenElement) {
            if (this.detailView.container.requestFullscreen) {
                this.detailView.container.requestFullscreen();
            } else if (this.detailView.container.webkitRequestFullscreen) {
                this.detailView.container.webkitRequestFullscreen();
            } else if (this.detailView.container.mozRequestFullScreen) {
                this.detailView.container.mozRequestFullScreen();
            }
            this.detailView.fullscreenBtn.textContent = 'Exit Fullscreen';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
            this.detailView.fullscreenBtn.textContent = 'Fullscreen';
        }
    }
    
    // Update detail view with student information
    updateDetailViewInfo(student) {
        if (!this.detailView.studentName) return;
        
        // Update student name
        this.detailView.studentName.textContent = student.name;
        this.detailView.studentNameOverlay.textContent = student.name;
        
        // Update connection status
        this.updateDetailConnectionStatus(student);
        
        // Update gaze info
        this.updateDetailGazeInfo(student);
        
        // NEW: Update AI detection info
        this.updateDetailAIInfo(student);
        
        // Update alerts
        this.updateDetailAlerts(student);
        
        // Update other students alerts
        this.updateOtherStudentsAlerts();
    }
    
    // Update detail view connection status
    updateDetailConnectionStatus(student) {
        if (!this.detailView.connectionStatus) return;
        
        const now = Date.now();
        const timeSinceLastFrame = student.lastFrameTime ? 
            now - student.lastFrameTime.getTime() : Infinity;
        
        let status = 'Connected';
        let statusClass = 'status-connected';
        let indicatorClass = '';
        
        if (timeSinceLastFrame > 10000) {
            status = 'Poor Connection';
            statusClass = 'status-disconnected';
            indicatorClass = 'poor';
        } else if (timeSinceLastFrame > 5000) {
            status = 'Weak Connection';
            statusClass = 'status-connecting';
            indicatorClass = 'weak';
        }
        
        this.detailView.connectionStatus.textContent = status;
        this.detailView.connectionStatus.className = statusClass;
        this.detailView.connectionIndicator.className = `detail-connection-indicator ${indicatorClass}`;
        
        // Update last frame time
        if (student.lastFrameTime) {
            const timeAgo = Math.round(timeSinceLastFrame / 1000);
            this.detailView.lastFrame.textContent = timeAgo < 60 ? 
                `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;
        } else {
            this.detailView.lastFrame.textContent = 'No data';
        }
    }
    
    // Update detail view gaze information
    updateDetailGazeInfo(student) {
        if (!this.detailView.gazeDirection) return;
        
        const currentGaze = this.detailView.gazeDirection.parentElement;
        
        if (student.gazeData) {
            // Update current gaze
            const directionMap = {
                'left': '👈 Looking Left',
                'right': '👉 Looking Right',
                'center': '👀 Looking at Screen',
                'blinking': '😴 Blinking',
                'unknown': '❓ No Detection',
                'error': '❌ Detection Error'
            };
            
            this.detailView.gazeDirection.textContent = 
                directionMap[student.gazeData.gaze_direction] || '❓ Unknown';
            
            const confidence = Math.round((student.gazeData.confidence || 0) * 100);
            this.detailView.gazeConfidence.textContent = `Confidence: ${confidence}%`;
            
            // Update gaze direction styling
            currentGaze.className = `current-gaze gaze-${student.gazeData.gaze_direction}`;
        } else {
            this.detailView.gazeDirection.textContent = '👀 Waiting for data...';
            this.detailView.gazeConfidence.textContent = 'Confidence: -';
            currentGaze.className = 'current-gaze';
        }
        
        // Update gaze history
        this.updateGazeHistory(student);
    }
    
    // NEW: Update detail view AI detection information
    updateDetailAIInfo(student) {
        if (!this.detailView.aiDetection) return;
        
        const currentAI = this.detailView.aiDetection.parentElement;
        
        if (student.aiDetectionData) {
            // Update current AI detection
            const detectionMap = {
                'real': '✅ Real Person',
                'fake': '🚨 AI Generated',
                'no_face': '👤 No Face Detected',
                'error': '❌ Detection Error'
            };
            
            this.detailView.aiDetection.textContent = 
                detectionMap[student.aiDetectionData.ai_detection] || '❓ Unknown';
            
            const confidence = Math.round((student.aiDetectionData.confidence || 0) * 100);
            this.detailView.aiConfidence.textContent = `Confidence: ${confidence}%`;
            
            // Update AI detection styling
            currentAI.className = `current-ai ai-${student.aiDetectionData.ai_detection}`;
        } else {
            this.detailView.aiDetection.textContent = '🤖 Waiting for data...';
            this.detailView.aiConfidence.textContent = 'Confidence: -';
            currentAI.className = 'current-ai';
        }
        
        // Update AI detection history
        this.updateAIHistory(student);
    }
    
    // Update gaze history in detail view
    updateGazeHistory(student) {
        if (!this.detailView.gazeHistory) return;
        
        const history = student.gazeHistory || [];
        
        if (history.length === 0) {
            this.detailView.gazeHistory.innerHTML = '<div class="no-alerts">No gaze data yet</div>';
            return;
        }
        
        const historyHTML = history.slice(-10).reverse().map(item => {
            const time = new Date(item.timestamp);
            const timeStr = Utils.formatTime(time);
            const direction = item.direction.charAt(0).toUpperCase() + item.direction.slice(1);
            
            return `
                <div class="gaze-history-item">
                    <span class="gaze-history-direction">${direction}</span>
                    <span class="gaze-history-time">${timeStr}</span>
                </div>
            `;
        }).join('');
        
        this.detailView.gazeHistory.innerHTML = historyHTML;
    }
    
    // NEW: Update AI detection history in detail view
    updateAIHistory(student) {
        if (!this.detailView.aiHistory) return;
        
        const history = student.aiDetectionHistory || [];
        
        if (history.length === 0) {
            this.detailView.aiHistory.innerHTML = '<div class="no-alerts">No AI detection data yet</div>';
            return;
        }
        
        const historyHTML = history.slice(-10).reverse().map(item => {
            const time = new Date(item.timestamp);
            const timeStr = Utils.formatTime(time);
            const detection = item.detection.charAt(0).toUpperCase() + item.detection.slice(1);
            
            return `
                <div class="ai-history-item">
                    <span class="ai-history-detection">${detection}</span>
                    <span class="ai-history-time">${timeStr}</span>
                </div>
            `;
        }).join('');
        
        this.detailView.aiHistory.innerHTML = historyHTML;
    }
    
    // Update detail view alerts
    updateDetailAlerts(student) {
        if (!this.detailView.alerts) return;
        
        const studentId = student.studentId;
        const gazeAlert = this.gazeAlerts.get(studentId);
        const aiAlert = this.aiDetectionAlerts.get(studentId);
        
        let alertsHTML = '';
        
        if (gazeAlert) {
            const alertTime = new Date(gazeAlert.timestamp);
            const timeStr = Utils.formatTime(alertTime);
            
            alertsHTML += `
                <div class="alert-item ${gazeAlert.alert.severity}">
                    <div class="alert-message">👀 ${gazeAlert.alert.message}</div>
                    <div class="alert-time">${timeStr}</div>
                </div>
            `;
        }
        
        if (aiAlert) {
            const alertTime = new Date(aiAlert.timestamp);
            const timeStr = Utils.formatTime(alertTime);
            
            alertsHTML += `
                <div class="alert-item ${aiAlert.alert.severity}">
                    <div class="alert-message">🤖 ${aiAlert.alert.message}</div>
                    <div class="alert-time">${timeStr}</div>
                </div>
            `;
        }
        
        if (!alertsHTML) {
            alertsHTML = '<div class="no-alerts">No active alerts</div>';
        }
        
        this.detailView.alerts.innerHTML = alertsHTML;
    }
    
    // Update other students alerts
    updateOtherStudentsAlerts() {
        if (!this.detailView.otherStudentsAlerts) return;
        
        const otherAlerts = Array.from(this.otherStudentAlerts.values())
            .filter(alert => {
                const student = this.students.get(this.currentDetailStudent);
                return student && alert.studentId !== student.studentId;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5); // Show last 5 alerts
        
        if (otherAlerts.length === 0) {
            this.detailView.otherStudentsAlerts.innerHTML = 
                '<div class="no-alerts">No alerts from other students</div>';
            return;
        }
        
        const alertsHTML = otherAlerts.map(alert => {
            const time = new Date(alert.timestamp);
            const timeStr = Utils.formatTime(time);
            const alertType = alert.alert.type === 'ai_generated_content' ? '🤖' : '👀';
            
            return `
                <div class="other-student-alert ${alert.alert.severity}">
                    <div class="other-alert-content">
                        <div class="other-alert-student">${alert.studentName}</div>
                        <div class="other-alert-message">${alertType} ${alert.alert.message}</div>
                    </div>
                    <div class="other-alert-time">${timeStr}</div>
                </div>
            `;
        }).join('');
        
        this.detailView.otherStudentsAlerts.innerHTML = alertsHTML;
    }
    
    clearSlot(slotNumber) {
        const slotElement = this.gridContainer.querySelector(`[data-slot="${slotNumber}"]`);
        if (!slotElement) return;
        
        slotElement.className = 'student-slot empty';
        slotElement.innerHTML = `
            <div class="slot-content">
                <div class="empty-message">
                    <div class="slot-number">${slotNumber}</div>
                    <div class="waiting-text">Waiting for student...</div>
                </div>
            </div>
        `;
    }
    
    clearAllSlots() {
        this.slots.clear();
        for (let i = 1; i <= this.maxSlots; i++) {
            this.clearSlot(i);
        }
    }
    
    reassignStudents() {
        // Reassign existing students to available slots
        const studentsToReassign = Array.from(this.students.values())
            .filter(student => student.slotNumber && student.slotNumber > this.maxSlots);
        
        studentsToReassign.forEach(student => {
            // Clear old slot assignment
            if (student.slotNumber) {
                this.slots.delete(student.slotNumber);
                student.slotNumber = null;
            }
            
            // Find new slot
            const newSlot = this.findAvailableSlot();
            if (newSlot) {
                this.assignStudentToSlot(student.socketId, newSlot);
            }
        });
    }
    
    // Monitor connection quality
    startConnectionMonitoring() {
        setInterval(() => {
            const now = Date.now();
            this.students.forEach(student => {
                if (student.slotNumber && student.lastFrameTime) {
                    const timeSinceLastFrame = now - student.lastFrameTime.getTime();
                    
                    if (timeSinceLastFrame > 10000) {
                        // No frame for 10 seconds - poor connection
                        this.updateConnectionIndicator(student.slotNumber, 'poor');
                    } else if (timeSinceLastFrame > 5000) {
                        // No frame for 5 seconds - weak connection
                        this.updateConnectionIndicator(student.slotNumber, 'weak');
                    } else {
                        // Recent frame - good connection
                        this.updateConnectionIndicator(student.slotNumber, 'good');
                    }
                }
            });
        }, 3000); // Check every 3 seconds
    }
    
    // Get gaze statistics for all students
    getGazeStatistics() {
        const stats = {
            totalStudents: this.students.size,
            studentsWithGazeData: 0,
            gazeDirections: {
                center: 0,
                left: 0,
                right: 0,
                blinking: 0,
                unknown: 0
            },
            averageConfidence: 0,
            activeAlerts: this.gazeAlerts.size
        };
        
        let totalConfidence = 0;
        let confidenceCount = 0;
        
        this.students.forEach(student => {
            if (student.gazeData) {
                stats.studentsWithGazeData++;
                
                const direction = student.gazeData.gaze_direction;
                if (stats.gazeDirections.hasOwnProperty(direction)) {
                    stats.gazeDirections[direction]++;
                }
                
                if (student.gazeData.confidence) {
                    totalConfidence += student.gazeData.confidence;
                    confidenceCount++;
                }
            }
        });
        
        if (confidenceCount > 0) {
            stats.averageConfidence = totalConfidence / confidenceCount;
        }
        
        return stats;
    }
    
    // NEW: Get AI detection statistics for all students
    getAIDetectionStatistics() {
        const stats = {
            totalStudents: this.students.size,
            studentsWithAIData: 0,
            aiDetections: {
                real: 0,
                fake: 0,
                no_face: 0,
                error: 0
            },
            averageConfidence: 0,
            activeAlerts: this.aiDetectionAlerts.size
        };
        
        let totalConfidence = 0;
        let confidenceCount = 0;
        
        this.students.forEach(student => {
            if (student.aiDetectionData) {
                stats.studentsWithAIData++;
                
                const detection = student.aiDetectionData.ai_detection;
                if (stats.aiDetections.hasOwnProperty(detection)) {
                    stats.aiDetections[detection]++;
                }
                
                if (student.aiDetectionData.confidence) {
                    totalConfidence += student.aiDetectionData.confidence;
                    confidenceCount++;
                }
            }
        });
        
        if (confidenceCount > 0) {
            stats.averageConfidence = totalConfidence / confidenceCount;
        }
        
        return stats;
    }
    
    getGridState() {
        return {
            currentGridSize: this.currentGridSize,
            maxSlots: this.maxSlots,
            studentCount: this.students.size,
            occupiedSlots: this.slots.size,
            gazeTrackingEnabled: this.gazeTrackingEnabled,
            gazeAlerts: this.gazeAlerts.size,
            // NEW: AI detection state
            aiDetectionEnabled: this.aiDetectionEnabled,
            aiDetectionAlerts: this.aiDetectionAlerts.size,
            detailViewActive: !!this.currentDetailStudent,
            currentDetailStudent: this.currentDetailStudent,
            students: Array.from(this.students.values()).map(student => ({
                name: student.name,
                slotNumber: student.slotNumber,
                lastFrameTime: student.lastFrameTime,
                gazeDirection: student.gazeData?.gaze_direction,
                gazeConfidence: student.gazeData?.confidence,
                // NEW: AI detection data
                aiDetection: student.aiDetectionData?.ai_detection,
                aiConfidence: student.aiDetectionData?.confidence
            }))
        };
    }
}

// Create global instance
window.studentGrid = new StudentGrid();