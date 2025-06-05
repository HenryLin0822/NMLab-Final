// Student Grid Manager
class StudentGrid {
    constructor() {
        this.gridContainer = document.getElementById('studentsGrid');
        this.gridSizeSelect = document.getElementById('gridSize');
        
        this.students = new Map(); // socketId -> student data
        this.slots = new Map(); // slotNumber -> student socketId
        this.maxSlots = 10;
        this.currentGridSize = '2x5';
        
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
            context: null
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
        
        // Create student info overlay
        const overlay = document.createElement('div');
        overlay.className = 'student-info';
        overlay.innerHTML = `
            <div class="student-name">${student.name}</div>
            <div class="student-status">Connected</div>
            <div class="connection-indicator"></div>
        `;
        
        // Update slot content
        slotElement.className = 'student-slot active';
        slotElement.innerHTML = '';
        
        const slotContent = document.createElement('div');
        slotContent.className = 'slot-content';
        slotContent.appendChild(canvas);
        slotContent.appendChild(overlay);
        
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
    
    getGridState() {
        return {
            currentGridSize: this.currentGridSize,
            maxSlots: this.maxSlots,
            studentCount: this.students.size,
            occupiedSlots: this.slots.size,
            students: Array.from(this.students.values()).map(student => ({
                name: student.name,
                slotNumber: student.slotNumber,
                lastFrameTime: student.lastFrameTime
            }))
        };
    }
}

// Create global instance
window.studentGrid = new StudentGrid();