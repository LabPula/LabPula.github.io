// GTD Task Manager - Main Application Logic

class GTDTaskManager {
    constructor() {
        this.tasks = [];
        this.currentEditingTask = null;
        this.draggedTask = null;
        this.filterDrawerExpanded = false;
        this.taskFormExpanded = false; // Track expanded form state
        this.useFirebase = false; // Will be enabled when Firebase is ready
        
        this.init();
    }

    init() {
        this.loadTasksFromStorage();
        this.setupEventListeners();
        this.setupServiceWorker();
        this.renderTasks();
        this.updateStatistics();
        
        // Initialize filter drawer as collapsed
        const filterDrawer = document.getElementById('filterDrawer');
        filterDrawer.classList.add('collapsed');
        
        // Check for Firebase availability
        this.checkFirebaseReady();
    }

    checkFirebaseReady() {
        if (window.firebaseManager && window.firebaseManager.user) {
            this.useFirebase = true;
            console.log('Firebase integration enabled');
        } else {
            // Check again after a short delay
            setTimeout(() => this.checkFirebaseReady(), 1000);
        }
    }

    // Utility Functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    formatDateTime(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleString();
    }

    getPriorityIcon(priority) {
        const icons = {
            urgent: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🔵'
        };
        return icons[priority] || '🔵';
    }

    // Task Management
    addTask(text, priority = 'medium', dueDate = null, notes = '', tags = [], progress = 0) {
        if (!text.trim()) return;

        const task = {
            id: this.generateId(),
            text: text.trim(),
            completed: false,
            priority: priority,
            dueDate: dueDate,
            createdAt: new Date().toISOString(),
            notes: notes.trim(),
            tags: tags.filter(tag => tag.trim()),
            progress: progress,
            archived: false,
            subtasks: []
        };

        this.tasks.unshift(task);
        this.saveTasksToStorage();
        
        // Also save to Firebase if available
        if (this.useFirebase && window.firebaseManager) {
            window.firebaseManager.saveTask(task);
        }
        
        this.renderTasks();
        this.updateStatistics();
        
        // Clear input fields
        this.clearTaskForm();
    }

    clearTaskForm() {
        document.getElementById('newTaskInput').value = '';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('newTaskNotes').value = '';
        document.getElementById('newTaskTags').value = '';
        document.getElementById('newTaskProgress').value = '0';
        document.getElementById('newProgressValue').textContent = '0%';
        document.getElementById('taskPriority').value = 'medium';
        
        // Collapse the expanded form
        if (this.taskFormExpanded) {
            this.toggleTaskForm();
        }
    }

    deleteTask(taskId) {
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.saveTasksToStorage();
        
        // Also delete from Firebase if available
        if (this.useFirebase && window.firebaseManager) {
            window.firebaseManager.deleteTask(taskId);
        }
        
        this.renderTasks();
        this.updateStatistics();
    }

    toggleTaskCompletion(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? new Date().toISOString() : null;
            
            // Also toggle subtasks
            this.toggleSubtasksCompletion(task.subtasks, task.completed);
            
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    toggleSubtasksCompletion(subtasks, completed) {
        subtasks.forEach(subtask => {
            subtask.completed = completed;
            subtask.completedAt = completed ? new Date().toISOString() : null;
            if (subtask.subtasks && subtask.subtasks.length > 0) {
                this.toggleSubtasksCompletion(subtask.subtasks, completed);
            }
        });
    }

    archiveTask(taskId) {
        const task = this.findTaskById(taskId);
        if (task) {
            task.archived = !task.archived;
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    addSubtask(parentId, text) {
        const parent = this.findTaskById(parentId);
        if (parent && text.trim()) {
            const subtask = {
                id: this.generateId(),
                text: text.trim(),
                completed: false,
                priority: 'medium',
                dueDate: null,
                createdAt: new Date().toISOString(),
                notes: '',
                tags: [],
                progress: 0,
                archived: false,
                subtasks: []
            };
            
            parent.subtasks.push(subtask);
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    findTaskById(id, tasks = this.tasks) {
        for (const task of tasks) {
            if (task.id === id) return task;
            if (task.subtasks && task.subtasks.length > 0) {
                const found = this.findTaskById(id, task.subtasks);
                if (found) return found;
            }
        }
        return null;
    }

    updateTask(taskId, updates) {
        const task = this.findTaskById(taskId);
        if (task) {
            Object.assign(task, updates);
            this.saveTasksToStorage();
            
            // Also update in Firebase if available
            if (this.useFirebase && window.firebaseManager) {
                window.firebaseManager.saveTask(task);
            }
            
            this.renderTasks();
            this.updateStatistics();
        }
    }

    // Filtering and Sorting
    getFilteredTasks() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const priorityFilter = document.getElementById('priorityFilter').value;

        return this.tasks.filter(task => {
            // Search filter
            const matchesSearch = !searchTerm || 
                task.text.toLowerCase().includes(searchTerm) ||
                task.notes.toLowerCase().includes(searchTerm) ||
                task.tags.some(tag => tag.toLowerCase().includes(searchTerm));

            // Status filter
            let matchesStatus = true;
            if (statusFilter) {
                switch (statusFilter) {
                    case 'completed':
                        matchesStatus = task.completed;
                        break;
                    case 'pending':
                        matchesStatus = !task.completed;
                        break;
                    case 'overdue':
                        matchesStatus = this.isTaskOverdue(task);
                        break;
                    case 'due-soon':
                        matchesStatus = this.isTaskDueSoon(task);
                        break;
                }
            }

            // Priority filter
            const matchesPriority = !priorityFilter || task.priority === priorityFilter;

            return matchesSearch && matchesStatus && matchesPriority;
        }).sort((a, b) => {
            // Sort by completion status (incomplete first)
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }

            // Sort by priority
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            const aPriority = priorityOrder[a.priority] || 3;
            const bPriority = priorityOrder[b.priority] || 3;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            // Sort by due date
            if (a.dueDate && b.dueDate) {
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;

            // Sort by creation date (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }

    isTaskOverdue(task) {
        return task.dueDate && !task.completed && new Date(task.dueDate) < new Date();
    }

    isTaskDueSoon(task) {
        if (!task.dueDate || task.completed) return false;
        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 3;
    }

    // Rendering
    renderTasks() {
        const container = document.getElementById('tasksContainer');
        const emptyState = document.getElementById('emptyState');
        const filteredTasks = this.getFilteredTasks();

        // Clear existing tasks except empty state
        const existingTasks = container.querySelectorAll('.task-card');
        existingTasks.forEach(task => task.remove());

        if (filteredTasks.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            filteredTasks.forEach(task => {
                this.renderTaskCard(task, container);
            });
        }
    }

    renderTaskCard(task, container, isSubtask = false) {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card drop-zone';
        taskCard.dataset.taskId = task.id;
        taskCard.draggable = true;

        // Add status classes
        if (task.completed) taskCard.classList.add('completed');
        if (this.isTaskOverdue(task)) taskCard.classList.add('overdue');
        if (this.isTaskDueSoon(task)) taskCard.classList.add('due-soon');

        // Task Header
        const header = document.createElement('div');
        header.className = 'task-header';

        const headerContent = document.createElement('div');
        headerContent.className = 'flex items-start gap-3';

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox mt-1';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => this.toggleTaskCompletion(task.id));

        // Task Content
        const content = document.createElement('div');
        content.className = 'task-content';

        // Task Text
        const taskText = document.createElement('div');
        taskText.className = 'task-text';
        taskText.innerHTML = marked.parse(task.text);

        content.appendChild(taskText);

        // Progress Bar
        if (task.progress > 0) {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'mb-2';
            
            const progressLabel = document.createElement('div');
            progressLabel.className = 'text-sm text-slate-400 mb-1';
            progressLabel.textContent = `Progress: ${task.progress}%`;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            
            const progressFill = document.createElement('div');
            progressFill.className = 'progress-fill';
            progressFill.style.width = `${task.progress}%`;
            
            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressLabel);
            progressContainer.appendChild(progressBar);
            content.appendChild(progressContainer);
        }

        // Tags
        if (task.tags && task.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'flex flex-wrap gap-1 mb-2';
            
            task.tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'tag';
                tagElement.textContent = tag;
                tagsContainer.appendChild(tagElement);
            });
            
            content.appendChild(tagsContainer);
        }

        // Priority Tag
        const priorityTag = document.createElement('span');
        priorityTag.className = `tag priority-${task.priority}`;
        priorityTag.textContent = `${this.getPriorityIcon(task.priority)} ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`;
        
        const priorityContainer = document.createElement('div');
        priorityContainer.className = 'flex gap-1 mb-2';
        priorityContainer.appendChild(priorityTag);
        content.appendChild(priorityContainer);

        // Action Buttons
        const actions = document.createElement('div');
        actions.className = 'task-actions';

        // Edit Button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit Task';
        editBtn.addEventListener('click', () => this.openEditModal(task));

        // Add Subtask Button
        const addSubtaskBtn = document.createElement('button');
        addSubtaskBtn.className = 'btn-icon';
        addSubtaskBtn.innerHTML = '➕';
        addSubtaskBtn.title = 'Add Subtask';
        addSubtaskBtn.addEventListener('click', () => this.promptAddSubtask(task.id));

        // Archive Button
        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'btn-icon';
        archiveBtn.innerHTML = task.archived ? '📤' : '📦';
        archiveBtn.title = task.archived ? 'Unarchive' : 'Archive';
        archiveBtn.addEventListener('click', () => this.archiveTask(task.id));

        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon text-red-400';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete Task';
        deleteBtn.addEventListener('click', () => this.confirmDelete(task.id));

        actions.appendChild(editBtn);
        actions.appendChild(addSubtaskBtn);
        actions.appendChild(archiveBtn);
        actions.appendChild(deleteBtn);

        headerContent.appendChild(checkbox);
        headerContent.appendChild(content);
        headerContent.appendChild(actions);
        header.appendChild(headerContent);
        taskCard.appendChild(header);

        // Task Footer
        const footer = document.createElement('div');
        footer.className = 'task-footer flex items-center justify-between';

        const leftMeta = document.createElement('div');
        leftMeta.className = 'flex items-center gap-4';

        const createdSpan = document.createElement('span');
        createdSpan.innerHTML = `📅 Created: ${this.formatDateTime(task.createdAt)}`;
        leftMeta.appendChild(createdSpan);

        if (task.dueDate) {
            const dueSpan = document.createElement('span');
            dueSpan.innerHTML = `⏰ Due: ${this.formatDateTime(task.dueDate)}`;
            leftMeta.appendChild(dueSpan);
        }

        const rightMeta = document.createElement('div');
        rightMeta.className = 'text-xs text-slate-500';
        rightMeta.textContent = `ID: ${task.id}`;

        footer.appendChild(leftMeta);
        footer.appendChild(rightMeta);
        taskCard.appendChild(footer);

        container.appendChild(taskCard);

        // Render Subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const subtaskContainer = document.createElement('div');
            subtaskContainer.className = 'subtask-container';
            
            task.subtasks.forEach(subtask => {
                this.renderTaskCard(subtask, subtaskContainer, true);
            });
            
            container.appendChild(subtaskContainer);
        }

        // Add drag and drop listeners
        this.addDragListeners(taskCard, task);
    }

    // Drag and Drop
    addDragListeners(element, task) {
        element.addEventListener('dragstart', (e) => {
            this.draggedTask = task;
            element.classList.add('drag-preview');
            e.dataTransfer.effectAllowed = 'move';
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('drag-preview');
            this.draggedTask = null;
            // Remove all drop indicators
            document.querySelectorAll('.drop-zone').forEach(zone => {
                zone.classList.remove('drop-above', 'drop-below', 'drop-inside');
            });
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.draggedTask || this.draggedTask.id === task.id) return;
            
            const rect = element.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;
            
            // Remove previous indicators
            element.classList.remove('drop-above', 'drop-below', 'drop-inside');
            
            if (y < height * 0.25) {
                element.classList.add('drop-above');
            } else if (y > height * 0.75) {
                element.classList.add('drop-below');
            } else {
                element.classList.add('drop-inside');
            }
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.draggedTask || this.draggedTask.id === task.id) return;
            
            // Handle the drop logic here
            console.log('Dropped task:', this.draggedTask.id, 'on:', task.id);
            // You can implement reordering logic here
            
            element.classList.remove('drop-above', 'drop-below', 'drop-inside');
        });
    }

    // Modal Management
    openEditModal(task) {
        this.currentEditingTask = task;
        
        document.getElementById('editTaskText').value = task.text;
        document.getElementById('editTaskNotes').value = task.notes || '';
        document.getElementById('editTaskPriority').value = task.priority;
        document.getElementById('editTaskDueDate').value = task.dueDate ? task.dueDate.slice(0, 16) : '';
        document.getElementById('editTaskTags').value = task.tags ? task.tags.join(', ') : '';
        document.getElementById('editTaskProgress').value = task.progress || 0;
        document.getElementById('editProgressValue').textContent = `${task.progress || 0}%`;
        
        this.showModal('editTaskModal');
    }

    saveTaskChanges() {
        if (!this.currentEditingTask) return;
        
        const updates = {
            text: document.getElementById('editTaskText').value.trim(),
            notes: document.getElementById('editTaskNotes').value.trim(),
            priority: document.getElementById('editTaskPriority').value,
            dueDate: document.getElementById('editTaskDueDate').value || null,
            tags: document.getElementById('editTaskTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
            progress: parseInt(document.getElementById('editTaskProgress').value)
        };
        
        this.updateTask(this.currentEditingTask.id, updates);
        this.closeModal('editTaskModal');
        this.currentEditingTask = null;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    confirmDelete(taskId) {
        const task = this.findTaskById(taskId);
        document.getElementById('confirmMessage').textContent = `Are you sure you want to delete "${task.text}"?`;
        
        const confirmBtn = document.getElementById('confirmBtn');
        confirmBtn.onclick = () => {
            this.deleteTask(taskId);
            this.closeModal('confirmModal');
        };
        
        this.showModal('confirmModal');
    }

    promptAddSubtask(parentId) {
        const text = prompt('Enter subtask text:');
        if (text) {
            this.addSubtask(parentId, text);
        }
    }

    // Statistics
    updateStatistics() {
        const allTasks = this.getAllTasks(this.tasks);
        const completed = allTasks.filter(task => task.completed);
        const overdue = allTasks.filter(task => this.isTaskOverdue(task));
        const dueSoon = allTasks.filter(task => this.isTaskDueSoon(task));
        
        const completionRate = allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0;
        
        document.getElementById('totalTasks').textContent = allTasks.length;
        document.getElementById('completedTasks').textContent = completed.length;
        document.getElementById('overdueTasks').textContent = overdue.length;
        document.getElementById('dueSoonTasks').textContent = dueSoon.length;
        document.getElementById('completionPercentage').textContent = `${completionRate}%`;
        document.getElementById('progressBar').style.width = `${completionRate}%`;
    }

    getAllTasks(tasks) {
        let allTasks = [];
        tasks.forEach(task => {
            allTasks.push(task);
            if (task.subtasks && task.subtasks.length > 0) {
                allTasks = allTasks.concat(this.getAllTasks(task.subtasks));
            }
        });
        return allTasks;
    }

    // Storage
    saveTasksToStorage() {
        try {
            localStorage.setItem('gtd-tasks', JSON.stringify(this.tasks));
            
            // Also save to Firebase if available (batch update)
            if (this.useFirebase && window.firebaseManager) {
                window.firebaseManager.saveAllTasks(this.tasks);
            }
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }

    async loadTasksFromStorage() {
        try {
            // Try to load from Firebase first if available
            if (this.useFirebase && window.firebaseManager) {
                const firebaseTasks = await window.firebaseManager.loadTasks();
                if (firebaseTasks.length > 0) {
                    this.tasks = firebaseTasks;
                    // Also update localStorage as backup
                    localStorage.setItem('gtd-tasks', JSON.stringify(this.tasks));
                    return;
                }
            }
            
            // Fallback to localStorage
            const stored = localStorage.getItem('gtd-tasks');
            if (stored) {
                this.tasks = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.tasks = [];
        }
    }

    // Import/Export
    exportToCSV() {
        const allTasks = this.getAllTasks(this.tasks);
        const headers = ['Text', 'Priority', 'Status', 'Created', 'Due Date', 'Progress', 'Tags', 'Notes'];
        const csvContent = [
            headers.join(','),
            ...allTasks.map(task => [
                `"${task.text.replace(/"/g, '""')}"`,
                task.priority,
                task.completed ? 'Completed' : 'Pending',
                this.formatDateTime(task.createdAt),
                task.dueDate ? this.formatDateTime(task.dueDate) : '',
                `${task.progress}%`,
                `"${task.tags.join(', ')}"`,
                `"${(task.notes || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gtd-tasks-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    importTasks() {
        document.getElementById('fileInput').click();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    this.tasks = imported;
                    this.saveTasksToStorage();
                    this.renderTasks();
                    this.updateStatistics();
                    alert('Tasks imported successfully!');
                }
            } catch (error) {
                alert('Failed to import tasks. Please check the file format.');
            }
        };
        reader.readAsText(file);
    }

    // UI Helpers
    toggleTaskForm() {
        const expandedForm = document.getElementById('expandedTaskForm');
        const expandBtn = document.getElementById('expandTaskFormBtn');
        
        this.taskFormExpanded = !this.taskFormExpanded;
        
        if (this.taskFormExpanded) {
            expandedForm.classList.remove('hidden');
            expandedForm.classList.add('show');
            expandBtn.innerHTML = '🔼';
            expandBtn.title = 'Less Options';
        } else {
            expandedForm.classList.add('hidden');
            expandedForm.classList.remove('show');
            expandBtn.innerHTML = '⚙️';
            expandBtn.title = 'More Options';
        }
    }

    toggleFilterDrawer() {
        const drawer = document.getElementById('filterDrawer');
        const icon = document.getElementById('filterToggleIcon');
        
        this.filterDrawerExpanded = !this.filterDrawerExpanded;
        
        if (this.filterDrawerExpanded) {
            drawer.classList.remove('collapsed');
            drawer.classList.add('expanded');
            icon.textContent = '▲';
        } else {
            drawer.classList.remove('expanded');
            drawer.classList.add('collapsed');
            icon.textContent = '▼';
        }
    }

    toggleDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId).parentElement;
        const isActive = dropdown.classList.contains('active');
        
        // Close all dropdowns
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
        
        // Toggle clicked dropdown
        if (!isActive) {
            dropdown.classList.add('active');
        }
    }

    clearCompleted() {
        if (confirm('Are you sure you want to delete all completed tasks?')) {
            this.tasks = this.tasks.filter(task => !task.completed);
            this.saveTasksToStorage();
            this.renderTasks();
            this.updateStatistics();
        }
    }

    // Service Worker
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                })
                .catch(error => {
                    console.log('SW registration failed:', error);
                });
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Add task
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            const text = document.getElementById('newTaskInput').value;
            const priority = document.getElementById('taskPriority').value;
            const dueDate = document.getElementById('taskDueDate').value || null;
            const notes = document.getElementById('newTaskNotes').value || '';
            const tags = document.getElementById('newTaskTags').value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag);
            const progress = parseInt(document.getElementById('newTaskProgress').value) || 0;
            
            this.addTask(text, priority, dueDate, notes, tags, progress);
        });

        // Enter key for add task
        document.getElementById('newTaskInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = document.getElementById('newTaskInput').value;
                const priority = document.getElementById('taskPriority').value;
                const dueDate = document.getElementById('taskDueDate').value || null;
                const notes = document.getElementById('newTaskNotes').value || '';
                const tags = document.getElementById('newTaskTags').value
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag);
                const progress = parseInt(document.getElementById('newTaskProgress').value) || 0;
                
                this.addTask(text, priority, dueDate, notes, tags, progress);
            }
        });

        // Expand task form
        document.getElementById('expandTaskFormBtn').addEventListener('click', () => this.toggleTaskForm());
        
        // Progress slider for new task
        document.getElementById('newTaskProgress').addEventListener('input', (e) => {
            document.getElementById('newProgressValue').textContent = `${e.target.value}%`;
        });

        // Filters
        document.getElementById('searchInput').addEventListener('input', () => this.renderTasks());
        document.getElementById('statusFilter').addEventListener('change', () => this.renderTasks());
        document.getElementById('priorityFilter').addEventListener('change', () => this.renderTasks());

        // Statistics toggle
        document.getElementById('toggleStats').addEventListener('click', () => {
            const panel = document.getElementById('statsPanel');
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                this.updateStatistics();
            } else {
                panel.classList.add('hidden');
            }
        });

        document.getElementById('closeStats').addEventListener('click', () => {
            document.getElementById('statsPanel').classList.add('hidden');
        });

        // Edit modal
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTaskChanges());
        
        // Progress slider
        document.getElementById('editTaskProgress').addEventListener('input', (e) => {
            document.getElementById('editProgressValue').textContent = `${e.target.value}%`;
        });

        // Export/Import
        document.getElementById('exportCsv').addEventListener('click', () => this.exportToCSV());
        document.getElementById('importTasks').addEventListener('click', () => this.importTasks());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));

        // Print
        document.getElementById('printTasks').addEventListener('click', () => window.print());

        // Clear completed
        document.getElementById('clearCompleted').addEventListener('click', () => this.clearCompleted());

        // Firebase controls
        document.getElementById('signOutBtn')?.addEventListener('click', () => {
            if (window.firebaseManager) {
                window.firebaseManager.signOut();
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
            }
        });

        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
                setTimeout(() => {
                    e.target.style.display = 'none';
                }, 300);
            }
        });
    }
}

// Global functions for HTML onclick handlers
function toggleFilterDrawer() {
    window.gtdApp.toggleFilterDrawer();
}

function toggleDropdown(id) {
    window.gtdApp.toggleDropdown(id);
}

function closeModal(id) {
    window.gtdApp.closeModal(id);
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gtdApp = new GTDTaskManager();
});
