/**
 * GymTrack AI - v35.1 Fixes & Water Goal Update
 *
 * Key changes implemented in this version:
 * 1. FIX: Resolved ReferenceError: absCounts is not defined (in getAbsDistributionData).
 * 2. FIX: Resolved ReferenceError: buildExerciseSelectorOptions is not defined (for Progress tab).
 * Minimal v1: removed Habits, Abs, Supps, Progress and Analysis UI tabs.
 * 4. MOD: Updated default water goal from 3.0L to 4.0L in createDefaultData.
 * 5. MOD: Removed 'Edit Goal' button from the Water Card in renderDashboard.
 * 6. FIX: Ensured all core functions called globally are defined.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. STATE & CONFIGURATION ---
    let appData = {};
    let charts = {}; // Stores Chart.js instances by their canvas ID
    const CHART_COLORS = {
        'aurora-dark': ['#a855f7', '#3b82f6', '#ec4899', '#4ade80', '#facc15', '#f43f5e', '#64748b'],
        'clean-light': ['#6d28d9', '#2563eb', '#db2777', '#16a34a', '#f59e0b', '#dc2626', '#475569'],
        'ocean-blue': ['#0a192f', '#17a2b8', '#6610f2', '#64ffda', '#fd7e14', '#dc3545', 'rgb(108, 117, 125)'],
        'forest-green': ['#28a34a', '#20c997', '#6f42c1', '#007bff', '#ffc107', '#dc3545', 'rgb(108, 117, 125)']
    };
    const GRADIENT_CLASSES = ['grad-purple', 'grad-blue', 'grad-green', 'grad-yellow'];
    let cardHeaderColorIndex = 0;
    let currentLogDate = '';
    let calendarViewDate = new Date(); // Used for Activity, Measurements, Supps date navigation
    let currentModalExercises = []; // Stores exercises for the current modal (plan edit, custom workout)
    let currentSessionExercises = null; // Holds exercises for the current logging session
    let loadedCustomWorkoutName = null; // Tracks if a custom workout is loaded for the current day
    let snapshotHistoryView = 'allTime'; // 'last3', 'last5', 'thisMonth', 'allTime', 'Monday', 'Tuesday', etc.
    let expandedSnapshotExercise = null; // Tracks the currently expanded exercise in Snapshot
    let selectedHabitForAdherence = null; // Tracks selected habit for adherence map
    let selectedSupplementForAdherence = 'Overall'; // Default to 'Overall'
    let selectedAbsForAdherence = 'Overall'; // Default to 'Overall'
    let prSearchTerm = ''; // State for PR search
    let prFilterMuscleGroup = 'All'; // State for PR muscle group filter
    let renderedSnapshotCharts = new Set(); // Tracks which snapshot mini-charts have been rendered this session
    // NEW: Activity Calendar Filters State
    let activityFilters = {
        workouts: true,
        measurements: true,
        supplements: true,
        habits: true,
        abs: true, 
        skipped: true, 
        notes: true, 
        water: true, // NEW: Filter for water logs
    };
    // NEW: Predefined Note Tags
    const NOTE_TAGS = ['Diet', 'Sleep', 'Energy', 'Stress', 'Recovery', 'Travel', 'Work', 'Injury', 'Motivation'];
    // NEW: Variable to hold the state of the log tab when a modal is opened
    let logTabState = null;
    // NEW: Expanded state for Log tab exercise cards
    let expandedLogCards = {};
    // NEW: Plank Timer State
    let plankTimerState = {
        isRunning: false,
        startTime: null,
        elapsedTime: 0,
        intervalId: null
    };
    // NEW: Selected body part for the Measurements chart
    let selectedBodyPartChart = null;
    let selectedActivityDate = null;


    // --- 2. DOM ELEMENT CACHE ---
    const getEl = id => document.getElementById(id);
    const elements = {
        body: document.body,
        modal: getEl('app-modal'),
        modalTitle: getEl('modal-title'),
        modalBody: getEl('modal-body'),
        modalFooter: getEl('modal-footer'),
        importFileInput: getEl('import-file-input'),
    };

    // --- 3. INITIALIZATION ---
    function init() {
        Date.prototype.getWeek = function () {
            var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
            var dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        };
        loadData();
        applyTheme(appData.settings.theme);
        setupEventListeners();
        setCurrentLogDate(new Date()); // Initial call to set currentLogDate and its activePlanName
        handleTabClick('dashboard', true);
    }

    // --- 4. DATA HANDLING ---
    function loadData() {
        const savedData = localStorage.getItem('gymTrackAI_v17');
        // IMPORTANT: Create a fresh, deep copy of defaultData to avoid mutation
        let defaultData = createDefaultData();

        // Deep merge saved data over default data.
        appData = savedData ? deepMerge(defaultData, JSON.parse(savedData)) : defaultData;

        // Ensure activeWeeklyPlan is set and valid
        if (!appData.weeklyPlans) {
            appData.weeklyPlans = {
                default: JSON.parse(JSON.stringify(defaultData.weeklyPlans.default))
            };
        } else if (!appData.weeklyPlans.default) {
            appData.weeklyPlans.default = JSON.parse(JSON.stringify(defaultData.weeklyPlans.default));
        }
        // Ensure the activeWeeklyPlan points to an existing plan, default to 'default' if not
        appData.settings.activeWeeklyPlan = 'default';

        // Ensure all top-level properties exist, adding defaults if missing
        if (!appData.exerciseDatabase) appData.exerciseDatabase = [];
        if (!appData.customMuscleGroups) appData.customMuscleGroups = [];
        if (!appData.absMuscleGroups) appData.absMuscleGroups = ["Upper Abs", "Lower Abs", "Side Abs", "Overall Abs"]; // NEW
        if (!appData.supplementLibrary) appData.supplementLibrary = [];
        // Updated logs structure
        if (!appData.logs) appData.logs = {
            workouts: {},
            measurements: {},
            daily: {},
            dailyNotes: {},
            abs: {},
            planks: {},
            waterLog: {} // NEW: Water log structure
        };
        if (!appData.logs.dailyNotes) appData.logs.dailyNotes = {};
        if (!appData.logs.abs) appData.logs.abs = {}; 
        if (!appData.logs.planks) appData.logs.planks = {}; 
        if (!appData.logs.waterLog) appData.logs.waterLog = {}; // NEW: Ensure waterLog exists
        
        if (!appData.goals) appData.goals = [];
        if (!appData.personalRecords) appData.personalRecords = {};
        if (appData.planTemplates) delete appData.planTemplates; 
        if (!appData.customWorkouts) appData.customWorkouts = {};
        if (!appData.dailyChecklist) appData.dailyChecklist = ["Drink 3L water", "10k steps"];
        if (!appData.motivationalQuote) appData.motivationalQuote = "The only bad workout is the one that didn.t happen.";
        
        // MOD: Set default water goal to 4.0L
        if (!appData.settings) appData.settings = {
            gender: 'male',
            weightUnit: 'kg',
            distanceUnit: 'cm',
            height: 187,
            progression: 2.5,
            theme: 'aurora-dark',
            activeWeeklyPlan: 'default',
            waterGoal: 4.0 // MOD: Default water goal is 4.0L
        };
        // Ensure waterGoal exists and update if old 3.0L value is present and settings wasn't newly created
        if (!appData.settings.waterGoal || appData.settings.waterGoal === 3.0) {
            appData.settings.waterGoal = 4.0; // MOD: Override old default
        }
        
        if (!appData.weeklyMuscleSplits || Object.keys(appData.weeklyMuscleSplits).length === 0) {
            appData.weeklyMuscleSplits = JSON.parse(JSON.stringify(defaultData.weeklyMuscleSplits));
        }
        if (appData.customSkipReasons) delete appData.customSkipReasons;

        // Migrate old daily notes format if necessary (from string to object)
        for (const date in appData.logs.dailyNotes) {
            if (typeof appData.logs.dailyNotes[date] === 'string') {
                appData.logs.dailyNotes[date] = {
                    text: appData.logs.dailyNotes[date],
                    tags: []
                };
            } else if (!appData.logs.dailyNotes[date].tags) {
                appData.logs.dailyNotes[date].tags = [];
            }
            if (appData.logs.dailyNotes[date].mood) {
                delete appData.logs.dailyNotes[date].mood;
            }
        }

        seedExerciseDatabase();

        appData.supplementLibrary.forEach(supp => {
            if (!supp.notes) supp.notes = [];
            delete supp.unit;
            delete supp.totalAmount;
            delete supp.currentAmount;
        });
        saveData();
    }

    // Define saveData once here
    const saveData = debounce(() => {
        try {
            localStorage.setItem('gymTrackAI_v17', JSON.stringify(appData));
        } catch (error) {
            console.error("Error saving data:", error);
            showToast("Error saving data.", "error");
        }
    }, 1500);

    function createDefaultData() {
        const defaultSets = '3';
        const defaultReps = '';
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        const defaultWeeklyPlanStructure = {};
        daysOfWeek.forEach(day => {
            defaultWeeklyPlanStructure[day] = {
                name: `${day} Workout`,
                exercises: []
            };
        });

        defaultWeeklyPlanStructure.Monday.name = "Back, Biceps, Rear Delts, Lats Finisher";
        defaultWeeklyPlanStructure.Monday.exercises = [{
            name: "Wide Lat Pulldown - MAG Grip",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rows Wide - MAG Grip",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Straight Bar Pulldown",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Chest Seated Row Machine",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "T-Bar Rows",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Unilateral Bicep Curl (Cable)",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Hammer Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Preacher Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rear Delt Fly",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Reverse Pec Deck",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Straight-Arm Rope Pulldown",
            sets: '2',
            reps: defaultReps 
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Tuesday.name = "Legs, Calves, Triceps, Finishers";
        defaultWeeklyPlanStructure.Tuesday.exercises = [{
            name: "Leg Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Sumo Squat",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Smith Squat",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Lunges",
            sets: defaultSets,
            reps: defaultReps 
        }, {
            name: "Laying Leg Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Standing Calf Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Seated Calf Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Bar Pushdown",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Incline Skull Crusher",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Overhead Triceps Extension",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Leg Extension",
            sets: '3',
            reps: defaultReps 
        }, {
            name: "3 types Cable triceps",
            sets: '3',
            reps: defaultReps 
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Wednesday.name = "Traps, Chest, Shoulders, Finishers";
        defaultWeeklyPlanStructure.Wednesday.exercises = [{
            name: "Barbell Flat Bench Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Barbell Incline Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Incline DB Hammer Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Decline Cable Crossover",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Shoulder Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Side Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Front Delt DB Raise",
            sets: '3',
            reps: defaultReps
        }, {
            name: "Arnold Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Shrugs",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Rope Upright Rows",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Flat Cable Fly",
            sets: '3',
            reps: defaultReps
        }, {
            name: "3 Types Shoulder",
            sets: '3',
            reps: defaultReps
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Thursday.name = "Back, Biceps, Rear Delts, Finishers";
        defaultWeeklyPlanStructure.Thursday.exercises = [{
            name: "Cable Rows (Wide - Reverse)",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "T-Bar Row",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Straight Bar Pulldown",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Lat Pulldown",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Unilateral Bicep Curl (Cable)",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Concentration Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Hammer Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rope Face Pull",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rear Delt Fly",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rows - MAG Narrow",
            sets: '3',
            reps: defaultReps
        }, {
            name: "Preacher Curl",
            sets: '3',
            reps: defaultReps
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Friday.name = "Legs, Calves, Traps, Triceps, Finishers";
        defaultWeeklyPlanStructure.Friday.exercises = [{
            name: "Leg Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Sumo Squat",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Laying Leg Curl",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Standing Calf Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Seated Calf Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Barbell Shrugs (Reverse Grip)",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Rope Upright Rows",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Bar Pushdown",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Incline Skull Crusher",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Overhead Triceps Extension",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Leg Extension",
            sets: '3',
            reps: defaultReps
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Saturday.name = "Shoulders, Chest, Biceps, Shoulder Finishers";
        defaultWeeklyPlanStructure.Saturday.exercises = [{
            name: "Arnold Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Side Cable Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Rope Upright Row",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Front Raise",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Cable Rear Delt Fly",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Flat Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Incline DB Press",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Decline Cable Crossover",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "Flat Cable Fly",
            sets: defaultSets,
            reps: defaultReps
        }, {
            name: "DB Hammer Curl",
            sets: '2',
            reps: defaultReps
        }, {
            name: "3 Types Tricep",
            sets: '3',
            reps: defaultReps
        }].map(ex => ({
            ...ex
        }));

        defaultWeeklyPlanStructure.Sunday.name = "Rest Day";
        defaultWeeklyPlanStructure.Sunday.exercises = [];


        return {
            settings: {
                gender: 'male',
                weightUnit: 'kg',
                distanceUnit: 'cm',
                height: 187,
                progression: 2.5,
                theme: 'aurora-dark',
                activeWeeklyPlan: 'default',
                waterGoal: 4.0, // MOD: Default water goal changed to 4.0L
            },
            weeklyPlans: {
                default: {
                    name: "My Weekly Plan",
                    plan: defaultWeeklyPlanStructure 
                }
            },
            weeklyMuscleSplits: JSON.parse(JSON.stringify({
                Monday: ['Back', 'Biceps', 'Rear Delts', 'Lats'],
                Tuesday: ['Legs', 'Calves', 'Triceps'],
                Wednesday: ['Traps', 'Chest', 'Shoulders'],
                Thursday: ['Back', 'Biceps', 'Rear Delts'],
                Friday: ['Legs', 'Calves', 'Traps', 'Triceps'],
                Saturday: ['Shoulders', 'Chest'],
                Sunday: ['Rest']
            })),
            dailyChecklist: ["Drink 3L water", "10k steps"],
            absMuscleGroups: ["Upper Abs", "Lower Abs", "Side Abs", "Overall Abs"], 
            exerciseDatabase: [],
            customBodyParts: [],
            supplementLibrary: [],
            logs: {
                workouts: {},
                measurements: {},
                daily: {},
                dailyNotes: {},
                abs: {}, 
                planks: {},
                waterLog: {} // NEW
            }, 
            goals: [],
            personalRecords: {},
            customWorkouts: {},
            motivationalQuote: "The only bad workout is the one that didn't happen."
        };
    }
    
    function deepMerge(target, source) {
        const output = {
            ...target
        };
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key]) && target[key] && !Array.isArray(source[key])) {
                    output[key] = deepMerge(target[key], source[key]);
                } else {
                    if (Array.isArray(source[key])) {
                        output[key] = JSON.parse(JSON.stringify(source[key])); 
                    } else {
                        output[key] = source[key];
                    }
                }
            });
        }
        return output;
    }
    function isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    function applyTheme(themeName) {
        document.body.dataset.theme = themeName;
    } 

    // --- 5. EVENT HANDLING ---
    function setupEventListeners() {
        document.body.addEventListener('click', handleGlobalClick);
        document.body.addEventListener('input', handleGlobalInput);
        elements.importFileInput.addEventListener('change', (e) => importDataFromFile(e));

        document.body.addEventListener('pointermove', (e) => {
            const {
                clientX,
                clientY
            } = e;
            const {
                innerWidth,
                innerHeight
            } = window;
            const xPercent = (clientX / innerWidth) * 100;
            const yPercent = (clientY / innerHeight) * 100;
            elements.body.style.setProperty('--aurora-top-color-pos', `${xPercent}% ${yPercent}%`);
            elements.body.style.setProperty('--aurora-bottom-color-pos', `${100 - xPercent}% ${100 - yPercent}%`);
        });

        // FIX: Centralized delegation for Plan Edit Modal buttons to immediately update the list
        // FIX: Centralized delegation for Plan Edit Modal buttons to immediately update the list
        document.body.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.plan-exercise-actions .delete-btn');
            if (deleteBtn && deleteBtn.dataset.action !== 'delete-set') { // Added check to avoid conflict with log sets
                const item = deleteBtn.closest('.plan-exercise-item');
                if (item) {
                    const modalId = item.dataset.modalId;
                    
                    // NEW: Find the parent list to determine context
                    const listContainer = item.closest('.plan-exercise-list');
                    if (listContainer) {
                        const listId = listContainer.id; // e.g., "plan-Monday-editor-list" or "customWorkout-editor-editor-list"
                        const parts = listId.split('-'); 
                        const context = parts[0]; // "plan" or "customWorkout"
                        const contextName = parts[1]; // "Monday" or "editor"
                        
                        // Pass the dynamic context to the delete function
                        deletePlanExercise(modalId, context, contextName, null); 
                    }
                }
            }
           
            const upBtn = e.target.closest('[data-action="move-plan-exercise-up"]');
            if (upBtn) {
                const item = upBtn.closest('.plan-exercise-item');
                if (item) {
                    movePlanExercise(item.dataset.modalId, -1); // This function now updates DOM efficiently
                }
            }
            
            const downBtn = e.target.closest('[data-action="move-plan-exercise-down"]');
            if (downBtn) {
                const item = downBtn.closest('.plan-exercise-item');
                if (item) {
                    movePlanExercise(item.dataset.modalId, 1); // This function now updates DOM efficiently
                }
            }
        });
    }

    function handleGlobalClick(e) {
        if (!e.target) {
            console.error("Click event target is undefined or null.", e);
            return;
        }

        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const {
            action,
            ...params
        } = actionTarget.dataset;

        if (actionTarget.tagName !== 'A' || action) e.preventDefault();

        const actions = {
            'switch-tab': () => handleTabClick(params.tab),
            'close-modal': () => closeModal(),
            'save-workout': saveWorkout,
            'save-measurements': saveMeasurements,
            'save-daily-log': saveDailyLog,
            'save-daily-note': saveDailyNote, 
            'save-abs-workout': saveAbsWorkout, 
            'start-plank-timer': startPlankTimer, 
            'stop-plank-timer': stopPlankTimer, 
            'save-water-log': saveWaterLog, // NEW
            'set-water-goal': () => showWaterGoalModal(), // NEW
            'save-new-water-goal': saveWaterGoal, // NEW
            'add-set': () => addSetToExercise(actionTarget.closest('.exercise-card')),
            'delete-set': (targetEl) => {
                const setEntry = targetEl.closest('.set-entry');
                if (setEntry) setEntry.remove();
            },
            'toggle-exercise-complete': () => toggleExerciseComplete(actionTarget.closest('.exercise-card')),
            'add-custom-body-part': addCustomBodyPart,
            'delete-custom-body-part': () => deleteCustomBodyPart(params.part),
            'set-measurement-goal': () => showGoalModal(params.part),
            'show-day-details': () => selectActivityDate(params.date),
            'show-load-workout-modal': showLoadWorkoutModal,
            'open-exercise-modal': showExerciseSelectionModal,
            'add-exercise-to-log-from-modal': () => {
                const logState = captureLogState();
                addNewExerciseToDatabase(params.name);
                addExerciseToLog(params.name);
                closeModal();
                restoreLogState(logState);
            },
            'import-from-file': () => elements.importFileInput.click(),
            'import-from-text': importDataFromText,
            'export-data': exportData,
            'save-settings': saveSettings,
            'open-plan-edit-modal': () => showPlanEditModal(params.day, params.weeklyPlanId),
            'add-checklist-item': addChecklistItem,
            'delete-checklist-item': () => deleteChecklistItem(params.item),
            'add-abs-muscle-group': addAbsMuscleGroup, 
            'delete-abs-muscle-group': () => deleteAbsMuscleGroup(params.item), 
            'add-supplement-library': addSupplementToLibrary,
            'delete-supplement': () => deleteSupplementFromLibrary(params.id),
            'edit-quote': editQuote,
            'toggle-body-part-chart': () => toggleBodyPartChart(params.part),
            'show-body-part-chart': () => setBodyPartChart(params.part), 
            'open-supplement-dashboard': () => showSupplementDashboard(params.id),
            'add-supplement-note': () => addSupplementNote(params.id),
            'recalculate-prs': recalculatePRs,
            'reset-app-data': resetAppData,
            'add-exercise-to-plan-modal': () => showExerciseSelectionForPlanModal(params.context, params.contextName, params.weeklyPlanId),
            'set-log-date': () => setCurrentLogDate(new Date(params.date)),
            'show-exercise-details-quick': () => showExerciseDetailsQuick(params.exerciseName),
            'add-exercise-to-plan-from-search': (target) => addExerciseToPlan(params.name, params.context, params.contextName, params.weeklyPlanId),
            'delete-exercise-from-db': () => deleteExerciseFromDatabase(params.name),
            'navigate-calendar': () => {
                const direction = parseInt(params.direction);
                const activeTabId = getActiveTabId();
                if (['log', 'measurements', 'notes', 'progress', 'snapshot', 'abs'].includes(activeTabId)) {
                    const newLogDate = new Date(currentLogDate);
                    newLogDate.setDate(newLogDate.getDate() + direction);
                    setCurrentLogDate(newLogDate);
                } else {
                    calendarViewDate.setMonth(calendarViewDate.getMonth() + direction);
                }
                render(activeTabId);
            },
            'toggle-muscle-group': () => {
                const header = actionTarget.closest('.muscle-group-header');
                const content = header.nextElementSibling;
                header.classList.toggle('expanded');
                content.style.display = header.classList.contains('expanded') ? 'block' : 'none';
            },
            'add-new-muscle-group': () => addNewMuscleGroup(),
            'add-exercise-to-group': () => addExerciseToGroup(params.group),
            'move-exercise': () => showMoveExerciseModal(params.name, params.muscle),
            'create-custom-workout': () => showCustomWorkoutModal(),
            'edit-custom-workout': () => showCustomWorkoutModal(params.name),
            'delete-custom-workout': () => deleteCustomWorkout(params.name),
            'save-custom-workout': saveCustomWorkout,
            'show-load-workout-modal': showLoadWorkoutModal,
            'load-custom-workout-to-log': () => loadCustomWorkoutToLog(params.name),
            'set-snapshot-view': () => setSnapshotHistoryView(params.view),
            'scroll-to-section': (target) => scrollToSection(params.targetId),
            'toggle-snapshot-exercise-details': (targetEl) => toggleSnapshotExerciseDetails(targetEl.closest('.snapshot-exercise-item')),
            'navigate-to-progress-and-analyze': () => navigateToProgressAndAnalyze(params.exerciseName),
            'log-skip-gym-notes-tab': logSkippedGymFromNotesTab, 
            'search-exercise-db': () => {
                const input = getEl('exercise-db-search-input');
                if (input) {
                    renderExerciseDatabaseManager(input.value);
                }
            },
            'edit-muscle-split': (targetEl) => {
                const dayElement = targetEl.closest('.plan-overview-day');
                if (dayElement) {
                    const day = dayElement.dataset.day;
                    showMuscleSplitEditModal(day);
                }
            },
            'save-muscle-split': () => saveMuscleSplit(params.day),
            'set-habit-adherence-view': () => setHabitAdherenceView(params.habitName),
            'set-supplement-adherence-view': () => setSupplementAdherenceView(params.suppId),
            'set-abs-adherence-view': () => setAbsAdherenceView(params.absName), 
            'filter-prs-by-muscle': () => {
                prFilterMuscleGroup = actionTarget.value;
                            },
            'search-prs': () => {
                prSearchTerm = getEl('pr-search-input').value;
                            },
            'toggle-habit-completion': () => handleChecklistChange(),
            'toggle-abs-completion': () => handleAbsChecklistChange(), 
            'reset-default-plan': resetDefaultWeeklyPlan,
            'set-active-weekly-template': (targetEl) => setActiveWeeklyTemplate(params.templateName), 
            'copy-day-plan': () => showCopyDayPlanModal(params.day, params.weeklyPlanId),
            'copy-weekly-plan': () => showCopyWeeklyPlanModal(params.weeklyPlanId),
            'delete-weekly-template': () => deleteWeeklyTemplate(params.templateName), 
            'toggle-pr-details': () => togglePRDetails(params.prKey),
            'toggle-activity-filter': () => toggleActivityFilter(params.filterType),
            'add-note-tag': () => addNoteTag(params.tag),
            'remove-note-tag': () => removeNoteTag(params.tag),
            'show-weekly-template-options': () => showWeeklyTemplateOptionsModal(params.templateName),
            'show-swap-exercise-modal': (targetEl) => {
                logTabState = captureLogState();
                showSwapExerciseModal(actionTarget.closest('.exercise-card').dataset.exerciseName);
            },
            'swap-exercise-in-log': () => {
                swapExerciseInLog(params.originalExercise, params.newExercise);
                restoreLogState(logTabState);
                logTabState = null; 
            },
            'add-and-swap-exercise': () => {
                addAndSwapExercise(params.originalExercise, params.newExercise);
                restoreLogState(logTabState);
                logTabState = null; 
            },
            'toggle-log-card-details': (targetEl) => toggleLogCardDetails(targetEl.closest('.exercise-card')),
            'toggle-plan-exercise-details': (targetEl) => togglePlanExerciseDetails(targetEl.dataset.modalId),
            'move-plan-exercise-up': () => { /* Handled by delegated listener */ },
            'move-plan-exercise-down': () => { /* Handled by delegated listener */ },
        };

        if (actions[action]) {
            if (action === 'delete-set' || action === 'edit-muscle-split' || action === 'toggle-snapshot-exercise-details' || action === 'show-swap-exercise-modal' || action === 'toggle-log-card-details' || action === 'toggle-plan-exercise-details') {
                actions[action](actionTarget);
            } else {
                actions[action]();
            }
        }
    } 
    const handleGlobalInput = debounce((e) => {
        const el = e.target;
        if (el.id === 'progress-search-input') {
            const searchTerm = el.value.toLowerCase();
            const select = getEl('exercise-select');
            if (select) {
                const newOptions = buildExerciseSelectorOptions(searchTerm);
                select.innerHTML = '';
                select.append(...newOptions);
                const exactMatch = appData.exerciseDatabase.find(ex => ex.name.toLowerCase() === searchTerm);
                if (exactMatch) {
                    const option = select.querySelector(`option[value=\"${exactMatch.name}\"]`);
                    if (option) {
                        option.selected = true;
                        updateExerciseAnalysis([exactMatch.name]);
                    }
                } else {
                    updateExerciseAnalysis([]);
                }
            }
        }
        if (el.id === 'exercise-db-search-input') {
            renderExerciseDatabaseManager(el.value);
        }
        if (el.id === 'theme-select') applyTheme(el.value);
        if (el.matches('.log-supplement-item input[type="checkbox"]')) saveDailyLog();
        if (el.id === 'habit-select-adherence') setHabitAdherenceView(el.value);
        if (el.id === 'supplement-select-adherence') setSupplementAdherenceView(el.value);
        if (el.id === 'pr-search-input') {
            prSearchTerm = el.value;
                    }
        if (el.id === 'daily-note-textarea') {
            const saveBtn = getEl('save-daily-note-btn');
            const noteData = appData.logs.dailyNotes[currentLogDate];
            if (noteData && noteData.text) { 
                saveBtn.disabled = (el.value.trim() === noteData.text.trim());
            } else { 
                saveBtn.disabled = (el.value.trim() === '');
            }
        }
        if (el.id === 'swap-exercise-search-input') {
            const originalExerciseName = el.dataset.originalExercise;
            const listContainer = document.getElementById('swap-exercise-results-list');
            if (listContainer) {
                renderSwapExerciseResults(el.value.trim(), listContainer, originalExerciseName);
            }
        }
        if (el.closest('.plan-exercise-item.expanded')) {
            const input = el;
            const modalId = input.closest('.plan-exercise-item').dataset.modalId;
            let property = '';
            if (input.id.startsWith('name-input')) property = 'name';
            else if (input.id.startsWith('sets-input')) property = 'sets';
            else if (input.id.startsWith('reps-input')) property = 'reps';

            if (property) {
                updateExerciseProperty(modalId, property, input.value);
            }
            if (input.id.startsWith('order-input')) {
                updateExerciseOrder(modalId, input.value);
            }
        }
        // NEW: Water Intake Input update
        if (el.id === 'water-intake-input') {
            updateWaterIntakeProgress(parseFloat(el.value) || 0);
        }
        // NEW: Water Goal Input update
        if (el.id === 'water-goal-input') {
            const saveBtn = getEl('save-new-water-goal-btn');
            if (saveBtn) {
                saveBtn.disabled = !(parseFloat(el.value) > 0);
            }
        }
    }, 300);

    // --- 6. CORE LOGIC & SAVE FUNCTIONS ---
    async function resetAppData() {
        if (await showConfirmation("Are you sure you want to reset all app data? This is irreversible.")) {
            localStorage.removeItem('gymTrackAI_v17');
            showToast('App data has been reset. Reloading...', 'success');
            setTimeout(() => {
                if (typeof location.reload === 'function') location.reload();
                else init();
            }, 1500);
        }
    }
async function editQuote() {
        const newQuote = await showPrompt('Enter new motivational quote:', appData.motivationalQuote);
        if (newQuote) {
            appData.motivationalQuote = newQuote;
            saveData();
            render('dashboard');
        }
    }
    function getActiveTabId() {
        const activeNavButton = document.querySelector('.bottom-nav-btn.active');
        return activeNavButton ? activeNavButton.dataset.tab : 'dashboard';
    }

    function handleTabClick(tabId, isInitialLoad = false) {
        document.querySelectorAll('.bottom-nav-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

        document.querySelectorAll(`[data-tab=\"${tabId}\"]`).forEach(t => t.classList.add('active'));
        const newSection = document.getElementById(tabId);
        if (newSection) {
            if (!['log', 'measurements', 'notes', 'snapshot'].includes(tabId)) {
                calendarViewDate = new Date();
            }
            if (['log', 'measurements', 'notes'].includes(tabId)) {
                if (!currentLogDate || new Date(currentLogDate).toDateString() !== new Date().toDateString()) {
                    setCurrentLogDate(new Date());
                }
                calendarViewDate = new Date(currentLogDate);
            } else if (tabId === 'snapshot') {
                calendarViewDate = new Date(currentLogDate);
            }
            render(tabId);
            newSection.classList.add('active');
        }
    }

    function setCurrentLogDate(dateObj) {
        const {
            date
        } = getISTDateInfo(dateObj);
        currentLogDate = date;
        calendarViewDate = new Date(dateObj);
        currentSessionExercises = null; // Reset session exercises when date changes
        loadedCustomWorkoutName = null; // Reset loaded custom workout when date changes
        expandedLogCards = {}; // Reset expanded state for log cards
        
        renderedSnapshotCharts.clear();

        if (!appData.logs.daily[date]) {
            appData.logs.daily[date] = {};
        }
        appData.logs.daily[date].activePlanName = appData.settings.activeWeeklyPlan;
        saveData(); 

        const activeTabId = getActiveTabId();
        if (['log', 'measurements', 'notes', 'snapshot'].includes(activeTabId)) {
            render(activeTabId);
        }
    }
    function handleChecklistChange() {
        const date = currentLogDate;
        const todayLog = appData.logs.daily[date] || {
            supplements: [],
            checklist: []
        };
        const newChecklist = [];
        document.querySelectorAll('#daily-checklist-container input[type=\"checkbox\"]').forEach(box => {
            if (box.checked) {
                newChecklist.push(box.dataset.item);
            }
        });
        todayLog.checklist = newChecklist;
        appData.logs.daily[date] = todayLog;
        saveData();
        if (document.getElementById('habits')?.classList.contains('active')) {
            render('habits');
        }
        showToast('Habits Saved!', 'success');
                if (getActiveTabId() === 'dashboard') render('dashboard');
    }
    
    function handleAbsChecklistChange() {
        const date = currentLogDate;
        const todayAbsLog = appData.logs.abs[date] || { absMuscles: [] };
        const newAbsMuscles = [];
        document.querySelectorAll('#abs-checklist-container input[type=\"checkbox\"]').forEach(box => {
            if (box.checked) {
                newAbsMuscles.push(box.dataset.item);
            }
        });
        todayAbsLog.absMuscles = newAbsMuscles;
        if (newAbsMuscles.length > 0) {
            appData.logs.abs[date] = todayAbsLog;
        } else {
            delete appData.logs.abs[date];
        }
        saveData();
        if (document.getElementById('abs')?.classList.contains('active')) {
            render('abs');
        }
        showToast('Abs Workout Logged!', 'success');
        if (getActiveTabId() === 'dashboard') render('dashboard');
        if (getActiveTabId() === 'activity') render('activity');
            }

    function saveAbsWorkout() {
        handleAbsChecklistChange();
        showToast('Abs workout saved!', 'success');
    }

    function startPlankTimer() {
        if (plankTimerState.isRunning) return;
        plankTimerState.isRunning = true;
        plankTimerState.startTime = Date.now() - plankTimerState.elapsedTime;
        plankTimerState.intervalId = setInterval(() => {
            plankTimerState.elapsedTime = Date.now() - plankTimerState.startTime;
            const timerDisplay = getEl('plank-timer-display');
            if (timerDisplay) timerDisplay.textContent = formatTime(plankTimerState.elapsedTime);
        }, 100);
        
        getEl('start-plank-timer-btn').classList.add('hidden');
        getEl('stop-plank-timer-btn').classList.remove('hidden');
    }

    function stopPlankTimer() {
        if (!plankTimerState.isRunning) return;
        clearInterval(plankTimerState.intervalId);
        plankTimerState.isRunning = false;

        const date = currentLogDate;
        const duration = Math.round(plankTimerState.elapsedTime / 1000); // in seconds
        
        if (duration > 0) {
            if (!appData.logs.planks[date]) {
                appData.logs.planks[date] = [];
            }
            appData.logs.planks[date].push({ time: duration, timestamp: Date.now() });
            saveData();
            showToast(`Plank time saved: ${duration} seconds!`, 'success');
        }
        
        plankTimerState.elapsedTime = 0;
        getEl('plank-timer-display').textContent = '00:00';
        getEl('start-plank-timer-btn').classList.remove('hidden');
        getEl('stop-plank-timer-btn').classList.add('hidden');
        
        if (document.getElementById('abs')?.classList.contains('active')) {
            render('abs');
        }
    }
    
    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // NEW: Save Water Intake Log
    function saveWaterLog() {
        const date = currentLogDate;
        const inputEl = getEl('water-intake-input');
        const waterAmount = parseFloat(inputEl.value);
        
        if (isNaN(waterAmount) || waterAmount < 0) {
            return showToast('Please enter a valid water amount.', 'error');
        }

        appData.logs.waterLog[date] = { intake: waterAmount };
        saveData();
        showToast(`${waterAmount}L water intake logged!`, 'success');
        
        // Re-render relevant tabs
        if (document.getElementById('habits')?.classList.contains('active')) {
            render('habits');
        }
        if (getActiveTabId() === 'dashboard') render('dashboard');
        if (getActiveTabId() === 'activity') render('activity');
            }
    
    // NEW: Show Water Goal Modal
    function showWaterGoalModal() {
        const goalInputId = 'water-goal-input';
        const currentGoal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0

        openModal("Set Daily Water Goal", [
            createLabelForInput(goalInputId, 'Target (Liters)'),
            createInput({
                type: 'number',
                id: goalInputId,
                value: currentGoal.toFixed(1),
                step: 0.5,
                min: 0.5,
                placeholder: 'e.g., 4.0'
            })
        ], [
            createButton({
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                id: 'save-new-water-goal-btn',
                content: 'Save Goal',
                'data-action': 'save-new-water-goal',
                disabled: false
            })
        ]);
    }

    // NEW: Save Water Goal
    function saveWaterGoal() {
        const goalValue = parseFloat(getEl('water-goal-input').value);
        if (isNaN(goalValue) || goalValue <= 0) {
            return showToast('Please enter a valid positive goal.', 'error');
        }
        appData.settings.waterGoal = goalValue;
        saveData();
        closeModal();
        showToast(`Water goal set to ${goalValue.toFixed(1)}L!`, 'success');
        render('habits');
        render('dashboard');
    }
    
    // NEW: Update Water Intake Progress in Real-time in the Habits Tab
    function updateWaterIntakeProgress(currentIntake) {
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0
        const percentage = Math.min(100, (currentIntake / goal) * 100);
        
        const fillEl = getEl('water-progress-fill');
        const statusEl = getEl('water-status-display');
        
        if (fillEl && statusEl) {
            fillEl.style.width = `${percentage}%`;
            fillEl.textContent = `${percentage.toFixed(0)}%`;
            
            fillEl.classList.toggle('over-goal', currentIntake >= goal);
            
            statusEl.innerHTML = `${currentIntake.toFixed(1)}L / ${goal.toFixed(1)}L &nbsp; <i class="fas fa-droplet" style="color: var(--glow-water);"></i>`;
        }
    }


    function saveWorkout() {
        closeModal();

        const date = currentLogDate;
        const workoutData = {
            date,
            exercises: [],
            templateUsed: loadedCustomWorkoutName || appData.settings.activeWeeklyPlan
        }; // Store template used

        document.querySelectorAll('#log .exercise-card.completed').forEach(card => {
            const exerciseName = card.dataset.exerciseName;
            const substitutedFor = card.dataset.substitutedFor || null; // NEW: Capture substitutedFor
            if (!exerciseName) return;

            const sets = [];
            card.querySelectorAll('.set-entry').forEach(setEl => {
                const reps = parseFloat(setEl.querySelector('[data-type=\"reps\"]').value);
                const weight = parseFloat(setEl.querySelector('[data-type=\"weight\"]').value);

                if (reps > 0 && !isNaN(weight) && weight >= 0) {
                    sets.push({
                        reps,
                        weight
                    });
                    checkAndSavePR(exerciseName, reps, weight, date);
                }
            });
            if (sets.length > 0) {
                // NEW: Store substitutedFor in the logged exercise object
                workoutData.exercises.push({
                    name: exerciseName,
                    sets,
                    substitutedFor: substitutedFor
                });
            }
        });

        if (workoutData.exercises.length > 0) {
            appData.logs.workouts[date] = workoutData;
            if (appData.logs.daily[date] && appData.logs.daily[date].skipped) {
                delete appData.logs.daily[date].skipped;
            }
            showToast(`${workoutData.exercises.length} exercise(s) saved!`, 'success');
            saveData();
            render('log');
            render('dashboard');
            render('snapshot');
                    } else {
            if (appData.logs.workouts[date]?.exercises?.length > 0) {
                delete appData.logs.workouts[date];
                showToast('Workout log cleared for this day.', 'info');
                saveData();
                render('log');
                render('dashboard');
                render('snapshot');
                            } else {
                showToast('No completed exercises with valid data to save.', 'error');
            }
        }
        updateSaveWorkoutButtonState();
    }

    async function logSkippedGymFromNotesTab() {
        const omitFromStreak = getEl('omit-from-streak')?.checked || false;
        const confirmationMessage = `Are you sure you want to mark this day as skipped? ${omitFromStreak ? 'It will also be omitted from streak/adherence calculations.' : ''}`;

        if (await showConfirmation(confirmationMessage)) {
            const date = currentLogDate;
            if (!appData.logs.daily[date]) {
                appData.logs.daily[date] = {};
            }
            appData.logs.daily[date].skipped = {
                reason: 'See daily note',
                omitFromStreak
            };
            if (appData.logs.workouts[date]) {
                delete appData.logs.workouts[date];
            }
            saveData();
            showToast(`Today (${getISTDateInfo(new Date(currentLogDate)).displayDate}) marked as skipped.`, 'info');
            render('notes'); 
            render('dashboard');
            render('activity'); 
                    }
    }

    function saveDailyLog() {
        const date = currentLogDate;
        const todayLog = appData.logs.daily[date] || {
            supplements: [],
            checklist: []
        };
        const newSupplements = [];
        document.querySelectorAll('.log-supplement-item input[type=\"checkbox\"]:checked').forEach(box => {
            newSupplements.push({
                id: box.dataset.id
            });
        });
        todayLog.supplements = newSupplements;
        appData.logs.daily[date] = todayLog;
        saveData();
        showToast('Supplements Log Saved!', 'success'); 
        render('supplements');
            }

    async function saveDailyNote() {
        const date = currentLogDate;
        const noteText = getEl('daily-note-textarea').value.trim();
        const selectedTags = Array.from(document.querySelectorAll('.note-tag-checkbox:checked')).map(cb => cb.value);

        if (!appData.logs.dailyNotes) {
            appData.logs.dailyNotes = {};
        }

        const existingNoteData = appData.logs.dailyNotes[date];
        if (existingNoteData && existingNoteData.text && noteText !== existingNoteData.text) {
            showToast('Note for this day is already saved and cannot be modified.', 'error');
            getEl('daily-note-textarea').value = existingNoteData.text;
            return;
        }

        if (noteText || selectedTags.length > 0) {
            appData.logs.dailyNotes[date] = {
                text: noteText,
                tags: selectedTags,
            };
            showToast('Daily note saved!', 'success');
        } else {
            if (appData.logs.dailyNotes[date]) {
                delete appData.logs.dailyNotes[date];
                showToast('Daily note cleared.', 'info');
            } else {
                showToast('Note is empty, nothing to save.', 'error');
                return;
            }
        }
        saveData();
        render('notes'); 
        render('activity'); 
    }

    function addNoteTag(tag) {
        const currentNoteData = appData.logs.dailyNotes[currentLogDate] || {
            text: '',
            tags: []
        };
        if (!currentNoteData.tags.includes(tag)) {
            currentNoteData.tags.push(tag);
            appData.logs.dailyNotes[currentLogDate] = currentNoteData;
            saveData();
            render('notes'); 
        }
    }

    function removeNoteTag(tag) {
        const currentNoteData = appData.logs.dailyNotes[currentLogDate] || {
            text: '',
            tags: []
        };
        currentNoteData.tags = currentNoteData.tags.filter(t => t !== tag);
        appData.logs.dailyNotes[currentLogDate] = currentNoteData;
        saveData();
        render('notes'); 
    }

    function saveMeasurements() {
        const date = currentLogDate;
        if (!appData.logs.measurements) appData.logs.measurements = {};
        if (!appData.logs.measurements[date]) appData.logs.measurements[date] = {
            date,
            data: {}
        };
        let hasData = false;
        document.querySelectorAll('#measurements .current-measurement-input').forEach(input => {
            if (input.value) {
                appData.logs.measurements[date].data[input.dataset.part] = parseFloat(input.value);
                hasData = true;
            }
        });
        if (hasData) {
            showToast('Measurements saved!', 'success');
            saveData();
            render('measurements');
            render('dashboard');
                    } else {
            showToast('No measurements entered.', 'error');
        }
    }
    
    // NEW: Helper function to calculate suggested next sets for progressive overload
    function getSuggestedNextSets(exerciseName) {
        const history = getExerciseHistory(exerciseName);
        if (history.length === 0) {
            return { sets: [] };
        }

        const lastSession = history[0];
        const progression = appData.settings.progression || 2.5;

        const suggestedSets = lastSession.sets.map(set => {
            const suggestedWeight = (parseFloat(set.weight) + progression).toFixed(1);
            return {
                reps: set.reps,
                weight: suggestedWeight
            };
        });

        return {
            sets: suggestedSets,
            progressionDate: lastSession.date
        };
    }

    function saveSettings() {
        const s = appData.settings;
        s.gender = getEl('gender-select').value;
        s.height = parseFloat(getEl('user-height-input').value) || 187;
        s.weightUnit = getEl('weight-unit-select').value;
        s.distanceUnit = getEl('distance-unit-select').value;
        s.progression = parseFloat(getEl('progression-input').value) || 2.5;
        s.theme = getEl('theme-select').value;
        saveData();
        applyTheme(s.theme);
        showToast("Settings saved!", "success");
        render('dashboard');
        render('measurements');
        render('snapshot');
            }

    function addCustomBodyPart() {
        const input = getEl('new-body-part-input');
        const partName = input.value.trim();
        if (partName && !appData.customBodyParts.includes(partName) && !["Weight", "Neck", "Chest", "Waist", "Hips"].includes(partName)) {
            appData.customBodyParts.push(partName);
            input.value = '';
            saveData();
            render('measurements');
            showToast(`Custom body part "${partName}" added!`, 'success');
        } else {
            showToast('Invalid or duplicate part name.', 'error');
        }
    }
    
    function addAbsMuscleGroup() {
        const input = getEl('new-abs-muscle-group-input');
        const groupName = input.value.trim();
        if (groupName && !appData.absMuscleGroups.includes(groupName)) {
            appData.absMuscleGroups.push(groupName);
            input.value = '';
            saveData();
            render('plan');
            showToast(`Abs muscle group "${groupName}" added!`, 'success');
        } else {
            showToast('Invalid or duplicate group name.', 'error');
        }
    }
    
    async function deleteAbsMuscleGroup(group) {
        if (await showConfirmation(`Are you sure you want to delete "${group}"? This will remove all associated logged data.`)) {
            appData.absMuscleGroups = appData.absMuscleGroups.filter(g => g !== group);
            if (appData.logs.abs) {
                Object.values(appData.logs.abs).forEach(log => {
                    log.absMuscles = log.absMuscles.filter(a => a !== group);
                });
            }
            saveData();
            render('plan');
            showToast(`Abs muscle group "${group}" deleted.`, 'info');
        }
    }

    async function deleteCustomBodyPart(part) {
        if (await showConfirmation(`Are you sure you want to delete "${part}"? This will remove all associated logged data.`)) {
            appData.customBodyParts = appData.customBodyParts.filter(p => p !== part);
            if (appData.logs.measurements) {
                Object.values(appData.logs.measurements).forEach(log => {
                    if (log.data) delete log.data[part];
                });
            }
            appData.goals = appData.goals.filter(g => g.name === part);
            saveData();
            render('measurements');
            showToast(`Custom body part "${part}" deleted.`, 'info');
        }
    }

    function showGoalModal(partName) {
        const existingGoal = appData.goals.find(g => g.name === partName);
        const safePartName = partName.replace(/\s+/g, '-').toLowerCase();
        const inputId = 'goal-target-input';
        openModal(`Set Goal for ${partName}`, [
            createLabelForInput(inputId, `Target ${partName === 'Weight' ? `(${appData.settings.weightUnit})` : `(${appData.settings.distanceUnit})`}`),
            createInput({
                type: 'number',
                id: inputId,
                value: existingGoal?.target || '',
                placeholder: `Enter target value for ${partName}`
            })
        ], [
            createButton({
                id: `cancel-goal-modal-${safePartName}`,
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                id: `save-goal-button-${safePartName}`,
                content: 'Save Goal',
                onclick: () => saveMeasurementGoal(partName)
            })
        ]);
    }

    function saveMeasurementGoal(partName) {
        const targetValue = parseFloat(getEl('goal-target-input').value);
        if (isNaN(targetValue) || targetValue <= 0) {
            const existingGoalIndex = appData.goals.findIndex(g => g.name === partName);
            if (existingGoalIndex > -1) {
                appData.goals.splice(existingGoalIndex, 1);
                showToast(`Goal for ${partName} removed.`, 'info');
            } else {
                showToast('Please enter a valid positive number for the target.', 'error');
                return;
            }
        } else {
            const existingGoalIndex = appData.goals.findIndex(g => g.name === partName);
            const latestLog = findLatestSaturdayMeasurementLog() || findLatestLog(appData.logs.measurements || {});
            const startValue = latestLog?.data?.[partName] ?? targetValue;
            if (existingGoalIndex > -1) {
                appData.goals[existingGoalIndex].target = targetValue;
                appData.goals[existingGoalIndex].startValue = startValue;
            } else {
                appData.goals.push({
                    id: `goal_${Date.now()}`,
                    type: 'measurement',
                    name: partName,
                    target: targetValue,
                    startValue: startValue
                });
            }
            showToast(`Goal for ${partName} saved!`, 'success');
        }
        saveData();
        closeModal();
        render('measurements');
        render('dashboard');
            }

    function savePlan(day, weeklyPlanId) {
        const weeklyPlan = appData.weeklyPlans[weeklyPlanId];
        if (!weeklyPlan) return showToast('Weekly plan not found.', 'error');
        const plan = weeklyPlan.plan[day];
        if (!plan) return showToast('Day plan not found.', 'error'); 

        const planNameInput = getEl('day-plan-name-input');
        if (planNameInput) {
            weeklyPlan.plan[day].name = planNameInput.value.trim();
        }

        const exercisesToSave = currentModalExercises
            .filter(ex => ex.name.trim() !== '')
            .map(({
                modal_id,
                ...rest
            }) => {
                if (rest.originalName && rest.name !== rest.originalName) {
                    addNewExerciseToDatabase(rest.name);
                }
                return rest;
            });

        const reorderedExercises = exercisesToSave.sort((a, b) => a.order - b.order);

        weeklyPlan.plan[day].exercises = JSON.parse(JSON.stringify(reorderedExercises));

        const detectedMuscleGroups = new Set();
        if (exercisesToSave.length > 0) {
            exercisesToSave.forEach(ex => {
                const foundExercise = appData.exerciseDatabase.find(dbEx => dbEx.name === ex.name);
                const muscle = foundExercise ? foundExercise.muscle : guessMuscleGroup(ex.name);
                if (muscle && muscle !== 'Other' && muscle !== 'Rest') {
                    detectedMuscleGroups.add(muscle);
                }
            });
        }

        if (detectedMuscleGroups.size === 0) {
            appData.weeklyMuscleSplits[day] = ['Rest'];
        } else {
            const existingManualMuscles = appData.weeklyMuscleSplits[day] || [];
            const mergedMuscles = new Set([...existingManualMuscles.filter(m => !['Other', 'Rest'].includes(m)), ...Array.from(detectedMuscleGroups)]);

            if (mergedMuscles.size === 0 || (mergedMuscles.size === 1 && mergedMuscles.has('Rest'))) {
                appData.weeklyMuscleSplits[day] = ['Rest'];
            } else {
                appData.weeklyMuscleSplits[day] = Array.from(mergedMuscles).sort();
            }
        }

        saveData();
        seedExerciseDatabase();
        render('plan');
        render('dashboard');
        showToast(`${day}'s plan updated in "${weeklyPlan.name}"!`, 'success');
        closeModal();
    }

    function saveMuscleSplit(day) {
        const selectedMuscles = [];
        document.querySelectorAll('#muscle-split-edit-container input[type=\"checkbox\"]').forEach(checkbox => {
            if (checkbox.checked) {
                selectedMuscles.push(checkbox.value);
            }
        });

        appData.weeklyMuscleSplits[day] = selectedMuscles.length > 0 ? selectedMuscles.sort() : ['Rest'];
        saveData();
        render('plan');
        render('dashboard');
                showToast(`${day}'s muscle split updated!`, 'success');
        closeModal();
    }
    // --- 7. UI RENDERING ---
    function render(component) {
        const container = document.getElementById(component);
        if (!container) return;
        if (['dashboard','snapshot','activity','log','measurements','notes','plan','settings'].includes(component)) {
            container.innerHTML = '';
        }
        destroyAllCharts();
        cardHeaderColorIndex = 0;
        const renderMap = {
            dashboard: renderDashboard,
            snapshot: renderSnapshot,
            activity: renderActivity,
            log: renderLogWorkout,
            plan: renderPlan,
            measurements: renderMeasurements,
            notes: renderNotes,
            settings: renderSettings
        };
        if (!renderMap[component]) return;
        try {
            const content = renderMap[component]();
            if (Array.isArray(content)) container.append(...content.filter(Boolean));
            else if (content) container.append(content);
            if (component === 'dashboard') {
                const history = getCompletionPercentageHistory(30);
                const canvas = getEl('dashboard-completion-chart');
                if (canvas) {
                    createChart('dashboard-completion-chart', 'line', {
                        data: {
                            labels: history.labels,
                            datasets: [{
                                label: 'Exercise completion',
                                data: history.data,
                                borderColor: '#63c98b',
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                pointRadius: 2.5,
                                pointHoverRadius: 5,
                                pointBackgroundColor: '#63c98b',
                                pointBorderColor: '#63c98b',
                                fill: false,
                                tension: 0.28,
                                spanGaps: false
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    min: 0,
                                    max: 100,
                                    ticks: { color: '#9298a3', stepSize: 20, callback: value => `${value}%` },
                                    grid: { color: 'rgba(255,255,255,0.06)' }
                                },
                                x: {
                                    type: 'category',
                                    ticks: { color: '#9298a3', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
                                    grid: { display: false }
                                }
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: items => history.fullLabels?.[items[0]?.dataIndex] || items[0]?.label || '',
                                        label: ctx => {
                                            const i = ctx.dataIndex;
                                            if (history.data[i] === null) return 'Rest / no workout planned';
                                            return `${history.data[i].toFixed(0)}% complete · ${history.completed[i]} of ${history.planned[i]} exercises`;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`Error rendering ${component}:`, error);
            container.innerHTML = `<div class="card"><p class="error-message">Error loading section. Check console for details.</p></div>`;
        }
    }
    function getEffectiveWorkoutPlanForDate(dateStr, dayOfWeek, options = {}) {
        const workoutLog = appData.logs.workouts?.[dateStr];
        const dailyLog = appData.logs.daily?.[dateStr] || {};
        const preferredPlanName = options.planName || workoutLog?.templateUsed || dailyLog.activePlanName || appData.settings.activeWeeklyPlan;

        if (preferredPlanName && appData.weeklyPlans?.[preferredPlanName]) {
            return {
                source: 'weekly',
                name: preferredPlanName,
                plan: appData.weeklyPlans[preferredPlanName].plan?.[dayOfWeek] || { exercises: [], name: 'Rest Day' }
            };
        }
        if (preferredPlanName && appData.customWorkouts?.[preferredPlanName]) {
            return {
                source: 'custom',
                name: preferredPlanName,
                plan: appData.customWorkouts[preferredPlanName] || { exercises: [], name: preferredPlanName }
            };
        }
        const fallbackName = Object.keys(appData.weeklyPlans || {})[0];
        if (fallbackName && appData.weeklyPlans?.[fallbackName]) {
            return {
                source: 'weekly',
                name: fallbackName,
                plan: appData.weeklyPlans[fallbackName].plan?.[dayOfWeek] || { exercises: [], name: 'Rest Day' }
            };
        }
        return { source: null, name: null, plan: { exercises: [], name: 'Rest Day' } };
    }

    function getCompletedPlannedExerciseCount(plannedExercises, loggedExercises = []) {
        if (!plannedExercises.length || !loggedExercises.length) return 0;
        return plannedExercises.reduce((count, plannedEx) => {
            const completed = loggedExercises.some(loggedEx =>
                loggedEx.name === plannedEx.name || loggedEx.substitutedFor === plannedEx.name
            );
            return count + (completed ? 1 : 0);
        }, 0);
    }

    function renderDashboard() {
        const { day, date, displayDate } = getISTDateInfo();
        const effectivePlan = getEffectiveWorkoutPlanForDate(date, day);
        const todaysPlan = effectivePlan.plan || { exercises: [], name: 'Rest Day' };
        const plannedExercises = todaysPlan.exercises || [];
        const todaysLog = appData.logs.workouts?.[date];
        const completed = getCompletedPlannedExerciseCount(plannedExercises, todaysLog?.exercises || []);
        const todayPct = plannedExercises.length ? Math.min(100, completed / plannedExercises.length * 100) : null;
        const completionHistory = getCompletionPercentageHistory(30);
        const plannedDayValues = completionHistory.data.filter(value => value !== null);
        const averageDailyCompletion = plannedDayValues.length ? plannedDayValues.reduce((sum, value) => sum + value, 0) / plannedDayValues.length : 0;
        const workoutDays = plannedDayValues.filter(value => value > 0).length;
        const streak = calculateWorkoutStreak();

        const statusText = plannedExercises.length === 0
            ? 'Rest day'
            : completed >= plannedExercises.length
                ? 'Workout complete'
                : completed > 0
                    ? 'Workout in progress'
                    : 'Workout not started';
        const statusClass = plannedExercises.length === 0 ? 'neutral' : completed >= plannedExercises.length ? 'success' : completed > 0 ? 'info' : 'muted';

        const todayCard = createCard({ header: 'Today', cardClass: 'minimal-dashboard-card' }, [
            createEl('div', { className: 'dashboard-date', textContent: displayDate }),
            createEl('div', { className: 'dashboard-today-row' }, [
                createEl('div', {}, [
                    createEl('div', { className: 'dashboard-plan-name', textContent: plannedExercises.length ? (todaysPlan.name || 'Workout') : 'Rest Day' }),
                    createEl('div', { className: `dashboard-status ${statusClass}`, textContent: statusText })
                ]),
                createEl('div', { className: 'dashboard-completion-value', textContent: todayPct === null ? '—' : `${todayPct.toFixed(0)}%` })
            ]),
            plannedExercises.length ? createEl('div', { className: 'dashboard-completion-meta' }, [
                createEl('span', { textContent: `${completed} of ${plannedExercises.length} exercises completed` }),
                createEl('span', { textContent: todayPct === 100 ? 'Complete' : todayPct > 0 ? 'In progress' : 'Not started', className: todayPct === 100 ? 'complete-label' : '' })
            ]) : null,
            plannedExercises.length ? createEl('div', { className: 'dashboard-progress-track', 'aria-label': `Workout completion ${todayPct.toFixed(0)} percent` }, [createEl('div', { className: `dashboard-progress-fill ${todayPct === 100 ? 'complete' : ''}`, style: `width:${todayPct}%;` })]) : createEl('div', { className: 'dashboard-rest-note', textContent: 'No workout is planned for today.' })
        ]);

        const completionCard = createCard({ header: 'Workout Completion · Last 30 Days', cardClass: 'minimal-dashboard-card' }, [
            createEl('div', { className: 'dashboard-average-row' }, [
                createEl('div', {}, [createEl('div', { className: 'dashboard-stat-primary', textContent: `${averageDailyCompletion.toFixed(0)}%` }), createEl('div', { className: 'dashboard-stat-label', textContent: 'average daily completion' })]),
                createEl('div', { className: 'dashboard-secondary-stat' }, [createEl('strong', { textContent: `${workoutDays}` }), createEl('span', { textContent: 'workout days' })])
            ]),
            createEl('div', { className: 'dashboard-chart-wrap' }, [createEl('canvas', { id: 'dashboard-completion-chart' })]),
            createEl('div', { className: 'dashboard-chart-note', textContent: 'Each bar represents one planned workout day. Rest days are left blank.' }),
            createEl('div', { className: 'dashboard-two-stats' }, [
                createEl('div', {}, [createEl('strong', { textContent: `${streak}` }), createEl('span', { textContent: 'day streak' })]),
                createEl('div', {}, [createEl('strong', { textContent: `${plannedDayValues.length}` }), createEl('span', { textContent: 'planned days' })])
            ])
        ]);

        return [todayCard, completionCard];
    }
    function renderWorkoutStreakCard() {
        const workoutStreak = calculateWorkoutStreak();
        const longestWorkoutStreak = calculateLongestWorkoutStreak();
        const planAdherence = calculatePlanAdherence(30); 

        return createCard({
            header: `Workout Consistency`,
            cardClass: 'workout-streak-card' 
        }, [
            createEl('div', {
                className: 'kpi-grid'
            }, [
                createKPI('Current Streak', `${workoutStreak} Days`, '', workoutStreak > 0 ? 'up' : 'stable'),
                createKPI('Longest Streak', `${longestWorkoutStreak} Days`, '', longestWorkoutStreak > 0 ? 'up' : 'stable'),
                createKPI('Plan Adherence (30d)', `${planAdherence.percentage.toFixed(0)}%`, `(${planAdherence.done}/${planAdherence.planned})`, planAdherence.percentage >= 75 ? 'up' : 'down')
            ])
        ]);
    }
    function renderActivity() {
        const calendarContainer = createEl('div', { className: 'calendar-container minimal-activity-calendar', 'data-tab-context': 'activity' });
        calendarContainer.append(...renderCalendar('activity', 'activity-calendar-grid'));
        const legend = createEl('div', { className: 'activity-legend' }, [
            createEl('span', {}, [createEl('i', { className: 'legend-dot logged' }), createEl('span', { textContent: 'Workout logged' })]),
            createEl('span', {}, [createEl('i', { className: 'legend-dot missed' }), createEl('span', { textContent: 'Workout missed' })]),
            createEl('span', {}, [createEl('i', { className: 'legend-dot rest' }), createEl('span', { textContent: 'Rest / no plan' })])
        ]);
        const content = [createCard({ header: 'Workout Activity', cardClass: 'minimal-dashboard-card' }, [calendarContainer, legend])];
        if (selectedActivityDate) content.push(renderActivityDayDetails(selectedActivityDate));
        return content;
    }

    function selectActivityDate(dateStr) {
        selectedActivityDate = dateStr;
        render('activity');
        requestAnimationFrame(() => getEl('activity-day-details')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }

    function renderActivityDayDetails(dateStr) {
        const dateObj = new Date(dateStr);
        const { day, displayDate } = getISTDateInfo(dateObj);
        const dailyLog = appData.logs.daily?.[dateStr] || {};
        const workoutLog = appData.logs.workouts?.[dateStr];
        const planName = dailyLog.activePlanName || workoutLog?.templateUsed || 'default';
        const plan = appData.weeklyPlans?.[planName] || appData.weeklyPlans?.default;
        const planned = plan?.plan?.[day]?.exercises || [];
        const logged = workoutLog?.exercises || [];
        const loggedByPlan = new Map();
        logged.forEach(ex => {
            if (ex.substitutedFor) loggedByPlan.set(ex.substitutedFor, ex);
            loggedByPlan.set(ex.name, ex);
        });

        const rows = [];
        planned.forEach((plannedEx) => {
            const match = loggedByPlan.get(plannedEx.name);
            if (match) {
                const sets = (match.sets || []).map(set => `${set.weight}${appData.settings.weightUnit} × ${set.reps}`).join(' · ');
                const isSub = !!match.substitutedFor && match.substitutedFor === plannedEx.name && match.name !== plannedEx.name;
                rows.push(createEl('div', { className: `activity-day-exercise ${isSub ? 'substituted' : 'logged'}` }, [
                    createEl('div', { className: 'activity-day-exercise-main' }, [
                        createEl('span', { className: 'activity-status-mark', textContent: isSub ? '↪' : '✓' }),
                        createEl('div', {}, [
                            createEl('strong', { textContent: isSub ? match.name : plannedEx.name }),
                            isSub ? createEl('span', { className: 'activity-day-subtext', textContent: `Substituted for ${plannedEx.name}` }) : null
                        ].filter(Boolean))
                    ]),
                    createEl('span', { className: 'activity-day-sets', textContent: sets || 'Logged' })
                ]));
            } else {
                rows.push(createEl('div', { className: 'activity-day-exercise not-logged' }, [
                    createEl('div', { className: 'activity-day-exercise-main' }, [
                        createEl('span', { className: 'activity-status-mark', textContent: '○' }),
                        createEl('strong', { textContent: plannedEx.name })
                    ]),
                    createEl('span', { className: 'activity-day-sets', textContent: 'Not logged' })
                ]));
            }
        });

        const plannedNames = new Set(planned.map(ex => ex.name));
        const adhoc = logged.filter(ex => !plannedNames.has(ex.name) && !ex.substitutedFor);
        adhoc.forEach(ex => {
            const sets = (ex.sets || []).map(set => `${set.weight}${appData.settings.weightUnit} × ${set.reps}`).join(' · ');
            rows.push(createEl('div', { className: 'activity-day-exercise logged' }, [
                createEl('div', { className: 'activity-day-exercise-main' }, [createEl('span', { className: 'activity-status-mark', textContent: '+' }), createEl('strong', { textContent: ex.name })]),
                createEl('span', { className: 'activity-day-sets', textContent: sets || 'Logged' })
            ]));
        });

        const isFuture = dateObj > new Date(new Date().setHours(23,59,59,999));
        let statusText = planned.length ? `${logged.length ? logged.length : 0} exercise${logged.length === 1 ? '' : 's'} logged` : 'Rest / no workout planned';
        if (dailyLog.skipped) statusText = 'Workout skipped';
        if (isFuture) statusText = planned.length ? 'Upcoming workout' : 'No workout planned';

        return createCard({ header: displayDate, cardClass: 'minimal-dashboard-card activity-day-details', id: 'activity-day-details' }, [
            createEl('div', { className: 'activity-day-summary' }, [createEl('span', { textContent: statusText }), createEl('span', { textContent: plan?.plan?.[day]?.name || 'Rest Day' })]),
            rows.length ? createEl('div', { className: 'activity-day-list' }, rows) : createEl('div', { className: 'activity-day-empty', textContent: 'No planned exercises for this day.' })
        ]);
    }

    function toggleActivityFilter(filterType) {
        activityFilters[filterType] = !activityFilters[filterType];
        render('activity'); 
    }

    function renderGoalProgressCard() {
        if (!appData.goals || appData.goals.length === 0) {
            const emptyIcon = createEl('i', {
                className: 'fas fa-bullseye'
            });
            const emptyText = createEl('p', {
                textContent: 'Set your first goal in the Body tab to track your progress here!'
            });
            return createCard({
                header: 'Goal Progress'
            }, [createEl('div', {
                className: 'card-empty-state'
            }, [emptyIcon, emptyText])]);
        }

        const goalsContainer = createEl('div', {
            className: 'goals-container'
        });
        appData.goals.forEach(goal => {
            if (goal.type === 'measurement') {
                const latestSaturdayLog = findLatestSaturdayMeasurementLog();
                const currentValue = latestSaturdayLog?.data?.[goal.name];
                const displayUnit = goal.name === 'Weight' ? appData.settings.weightUnit : appData.settings.distanceUnit;
                const currentDisplay = currentValue !== undefined ? `${currentValue.toFixed(1)}` : 'N/A';
                const targetDisplay = `${goal.target.toFixed(1)}`;

                let progressPercentage = 0;
                if (typeof currentValue === 'number' && typeof goal.target === 'number' && typeof goal.startValue === 'number') {
                    if (goal.startValue !== goal.target) {
                        progressPercentage = ((currentValue - goal.startValue) / (goal.target - goal.startValue)) * 100;
                        progressPercentage = Math.max(0, Math.min(100, progressPercentage));
                    } else if (currentValue === goal.target) {
                        progressPercentage = 100;
                    }
                }

                const subCard = createEl('div', {
                    className: 'goal-sub-card'
                }, [
                    createEl('div', {
                        className: 'goal-sub-card-title',
                        textContent: goal.name
                    }),
                    createEl('div', {
                        className: 'goal-sub-card-progress-display'
                    }, [
                        createEl('span', {}, currentDisplay),
                        createEl('span', {
                            className: 'target'
                        }, ` / ${targetDisplay} ${displayUnit}`)
                    ]),
                    createEl('div', {
                        className: 'goal-progress-bar'
                    }, [
                        createEl('div', {
                            className: 'goal-progress-fill',
                            style: `width: ${progressPercentage.toFixed(0)}%;`
                        })
                    ])
                ]);
                goalsContainer.append(subCard);
            }
        });
        return createCard({
            header: 'Goal Progress'
        }, [goalsContainer]);
    }

    function renderLogWorkout() {
        const logDateObj = new Date(currentLogDate);
        const {
            date,
            day
        } = getISTDateInfo(logDateObj);

        let exercisesToDisplay = [];
        let planSourceText = '';
        if (loadedCustomWorkoutName && appData.customWorkouts[loadedCustomWorkoutName]) {
            exercisesToDisplay = appData.customWorkouts[loadedCustomWorkoutName].exercises;
            planSourceText = ` (from "${loadedCustomWorkoutName}")`;
        } else {
            const activePlan = appData.weeklyPlans[appData.settings.activeWeeklyPlan];
            const planForDay = activePlan?.plan?.[day] || {
                exercises: []
            };
            exercisesToDisplay = planForDay.exercises;
            planSourceText = ` (from Weekly Plan: "${activePlan.name}")`;
        }

        if (!currentSessionExercises) {
            currentSessionExercises = JSON.parse(JSON.stringify(exercisesToDisplay)).map((ex, index) => ({
                ...ex,
                log_id: `log_ex_${index}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` 
            }));
        } else {
            currentSessionExercises = currentSessionExercises.map(ex => ({
                ...ex,
                log_id: ex.log_id || `log_ex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
            }));
        }


        const todaysLog = appData.logs.workouts?.[date] || {
            exercises: []
        };

        const dateSelector = createEl('div', {
            className: 'log-date-selector'
        }, [
            createButton({
                content: '<i class="fas fa-chevron-left"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(new Date(logDateObj.setDate(logDateObj.getDate() - 1))).date
            }),
            createEl('span', {
                className: 'date-display'
            }, [
                createEl('span', {
                    textContent: getISTDateInfo(new Date(currentLogDate)).displayDate
                }),
                createEl('span', {
                    className: 'plan-source-text',
                    textContent: planSourceText
                })
            ]),
            createButton({
                id: 'log-date-next',
                content: '<i class="fas fa-chevron-right"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(new Date(logDateObj.setDate(logDateObj.getDate() + 2))).date
            }),
        ]);

        const exerciseCardsContainer = createEl('div', {
            id: 'log-exercise-cards',
            style: 'grid-column: 1 / -1; display: contents;'
        });
        const exerciseCards = renderLogExerciseCards(todaysLog, {
            exercises: currentSessionExercises
        });
        exerciseCardsContainer.append(...exerciseCards);

        const actions = createEl('div', {
            className: 'log-actions',
            style: 'grid-column: 1 / -1;'
        }, [
            createButton({
                id: 'add-exercise-button',
                content: '<i class="fas fa-plus"></i> Add Exercise',
                'data-action': 'open-exercise-modal'
            }),
            createButton({
                id: 'save-workout-button',
                content: '<i class="fas fa-save"></i> Save Workout',
                'data-action': 'save-workout'
            }),
        ]);

        if (exerciseCards.length === 0) {
            const emptyIcon = createEl('i', {
                className: 'fas fa-moon'
            });
            const emptyText = createEl('p', {
                textContent: "No workout is planned for this day."
            });
            const emptyState = createEl('div', {
                className: 'card-empty-state'
            }, [emptyIcon, emptyText]);
            return [dateSelector, createCard({
                header: 'Workout Log'
            }, [emptyState]), actions];
        }

        return [dateSelector, exerciseCardsContainer, actions];
    }

    
    function renderLogExerciseCards(todaysLog, currentPlan) {
        const exerciseCards = [];

        const allExercisesMap = new Map(); 

        (currentPlan?.exercises || []).forEach(ex => {
            allExercisesMap.set(ex.name, {
                ...ex,
                isPlanned: true,
                log_id: ex.log_id || `log_ex_${index}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` 
            });
        });

        (todaysLog?.exercises || []).forEach(loggedEx => {
            allExercisesMap.set(loggedEx.name, {
                ...allExercisesMap.get(loggedEx.name), 
                ...loggedEx, 
                isLogged: true,
                log_id: loggedEx.log_id || `log_ex_logged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` 
            });
        });

        const orderedExercises = (currentPlan?.exercises || []).map(ex => allExercisesMap.get(ex.name)).filter(Boolean);
        
        (todaysLog?.exercises || []).forEach(loggedEx => {
            if (!orderedExercises.some(ex => ex.name === loggedEx.name)) {
                orderedExercises.push({
                    ...loggedEx,
                    isLogged: true,
                    isPlanned: false,
                    log_id: loggedEx.log_id || `log_ex_adhoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
                });
            }
        });


        orderedExercises.forEach(exerciseData => {
            exerciseCards.push(renderExerciseCard(exerciseData));
        });

        return exerciseCards;
    }

    function renderExerciseCard(exerciseData) {
        const {
            name,
            sets,
            reps,
            substitutedFor,
            isLogged
        } = exerciseData;
        const isCompleted = !!isLogged; 
        const safeExerciseName = name.replace(/\s+/g, '-').toLowerCase();

        const isExpanded = expandedLogCards[exerciseData.log_id] || false;

        const card = createEl('div', {
            className: `card exercise-card ${isCompleted ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`,
            'data-exercise-name': name,
            'data-substituted-for': substitutedFor || '', 
            'data-log-id': exerciseData.log_id || `log_ex_card_${Date.now()}` 
        });

        const header = createEl('div', {
            className: 'exercise-header',
            'data-action': 'toggle-log-card-details',
            'data-log-id': exerciseData.log_id
        }, [
            createEl('div', { 
                className: 'exercise-title-group'
            }, [
                createEl('span', {
                    className: 'exercise-title',
                    textContent: name
                }),
                substitutedFor ? createEl('span', {
                    className: 'exercise-sub-heading',
                    textContent: `Swapped from: ${substitutedFor}`
                }) : null
            ]),
            createEl('div', {
                className: 'exercise-actions-group'
            }, [
                createButton({
                    id: `swap-btn-${safeExerciseName}`,
                    className: 'exercise-swap-btn',
                    content: '<i class="fas fa-exchange-alt"></i>',
                    'data-action': 'show-swap-exercise-modal',
                    'data-exercise-name': name,
                    title: 'Swap Exercise'
                }),
                createButton({
                    id: `tick-btn-${safeExerciseName}`,
                    className: 'exercise-tick-btn',
                    content: '<i class="fas fa-check"></i>',
                    'data-action': 'toggle-exercise-complete',
                    'aria-label': isCompleted ? `Mark ${name} incomplete` : `Mark ${name} complete`,
                    'aria-pressed': String(isCompleted)
                })
            ])
        ]);

        const detailsContainer = createEl('div', {
            className: 'exercise-details'
        });


        const setsContainer = createEl('div', {
            className: 'sets-container'
        });
        const setsToRender = Array.isArray(exerciseData.sets) ? exerciseData.sets : []; 

        if (setsToRender.length > 0) {
            setsToRender.forEach((set, i) => {
                setsContainer.append(createSetEntry(i + 1, set.reps, set.weight, exerciseData.log_id));
            });
        } else {
            const numPlannedSets = parseInt(sets) || 3;
            for (let i = 0; i < numPlannedSets; i++) {
                setsContainer.append(createSetEntry(i + 1, '', '', exerciseData.log_id));
            }
        }

        const addSetBtn = createButton({
            id: `add-set-btn-${safeExerciseName}`,
            content: '<i class="fas fa-plus"></i> Add Set',
            'data-action': 'add-set',
            style: 'width: 100%; margin-top: 10px; background: rgba(255,255,255,0.1);'
        });

        detailsContainer.append(setsContainer, addSetBtn);

        const completionOverlay = createEl('div', {
            className: 'completion-overlay'
        }, [
            createEl('svg', {
                className: 'completion-checkmark',
                viewBox: '0 0 52 52'
            }, [
                createEl('path', {
                    d: 'M14.1 27.2l7.1 7.2 16.7-16.8'
                })
            ])
        ]);

        card.append(header, detailsContainer, completionOverlay);
        return card;
    }
    
    // FIX: Updated createSetEntry to use type='number' and inputmode='numeric' for reps
    function createSetEntry(setNumber, reps, weight, logId) {
        const uniqueIdReps = `reps-${logId}-${setNumber}`;
        const uniqueIdWeight = `weight-${logId}-${setNumber}`;
        const uniqueIdDelete = `delete-set-${logId}-${setNumber}`;

        const setEntry = createEl('div', {
            className: 'set-entry'
        }, [
            createEl('span', {
                className: 'set-number',
                textContent: setNumber
            }),
            createInput({
                type: 'number', // FIX: Changed to 'number'
                inputmode: 'numeric', // FIX: Added for mobile numeric keyboard hint
                pattern: '[0-9]*', // FIX: Added for mobile numeric keyboard hint
                id: uniqueIdReps,
                placeholder: 'Reps',
                value: reps,
                'data-type': 'reps',
                'aria-labelledby': `label-${uniqueIdReps}`
            }),
            createInput({
                type: 'number',
                id: uniqueIdWeight,
                placeholder: `Weight (${appData.settings.weightUnit})`,
                value: weight,
                'data-type': 'weight',
                'aria-labelledby': `label-${uniqueIdWeight}`
            }),
            createButton({
                id: uniqueIdDelete,
                className: 'danger delete-btn',
                content: '<i class="fas fa-times"></i>',
                'data-action': 'delete-set'
            })
        ]);
        return setEntry;
    }

    function toggleLogCardDetails(cardElement) {
        if (!cardElement) return;

        const logId = cardElement.dataset.logId;
        const isCurrentlyExpanded = cardElement.classList.contains('expanded');

        document.querySelectorAll('.exercise-card.expanded').forEach(otherCard => {
            if (otherCard !== cardElement) {
                otherCard.classList.remove('expanded');
                delete expandedLogCards[otherCard.dataset.logId];
            }
        });

        cardElement.classList.toggle('expanded');
        expandedLogCards[logId] = !isCurrentlyExpanded;
    }

    function updateSaveWorkoutButtonState() {
        const saveButton = document.querySelector('[data-action="save-workout"]');
        if (!saveButton) return;

        const exerciseCards = document.querySelectorAll('#log .exercise-card');
        let hasCompletedExercises = false;
        exerciseCards.forEach(card => {
            if (card.classList.contains('completed')) {
                const sets = card.querySelectorAll('.set-entry');
                let hasValidSet = false;
                sets.forEach(setEl => {
                    const reps = parseFloat(setEl.querySelector('[data-type=\"reps\"]').value);
                    const weight = parseFloat(setEl.querySelector('[data-type=\"weight\"]').value);
                    if (reps > 0 && !isNaN(weight) && weight >= 0) {
                        hasValidSet = true;
                    }
                });
                if (hasValidSet) hasCompletedExercises = true;
            }
        });
        saveButton.disabled = !hasCompletedExercises;
    }

    function renderMeasurements() {
        const allParts = ["Weight", "Neck", "Chest", "Waist", "Hips", ...appData.customBodyParts];
        const inputsContainer = createEl('div', {
            className: 'measurement-inputs-container'
        });

        const logDateObj = new Date(currentLogDate);
        const prevDate = new Date(logDateObj);
        prevDate.setDate(logDateObj.getDate() - 1);
        const nextDate = new Date(logDateObj);
        nextDate.setDate(logDateObj.getDate() + 1);

        const dateSelector = createEl('div', {
            className: 'log-date-selector'
        }, [
            createButton({
                content: '<i class="fas fa-chevron-left"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(prevDate).date
            }),
            createEl('span', {
                className: 'date-display',
                textContent: getISTDateInfo(logDateObj).displayDate
            }),
            createButton({
                content: '<i class="fas fa-chevron-right"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(nextDate).date
            }),
        ]);


        allParts.forEach(part => {
            let prevValue = '';
            if (getISTDateInfo(new Date(currentLogDate)).day !== 'Saturday') {
                const latestSaturdayLog = findLatestSaturdayMeasurementLog(new Date(currentLogDate));
                if (latestSaturdayLog?.data?.[part]) {
                    prevValue = ` | Last Sat: ${latestSaturdayLog.data[part]}`;
                }
            } else {
                const latestLogBeforeCurrent = findLatestLog(appData.logs.measurements || {}, new Date(currentLogDate));
                if (latestLogBeforeCurrent?.data?.[part]) {
                    prevValue = ` | Last: ${latestLogBeforeCurrent.data[part]}`;
                }
            }

            const goal = appData.goals.find(g => g.name === part);
            const isCustom = appData.customBodyParts.includes(part);
            const goalDisplay = goal ? createEl('span', {
                className: 'goal-display',
                textContent: `Goal: ${goal.target}`
            }) : '';
            const currentValueForDate = appData.logs.measurements?.[currentLogDate]?.data?.[part] || '';
            const safePartName = part.replace(/\s+/g, '-').toLowerCase();
            const inputId = `measure-${safePartName}`;

            const inputGroup = createEl('div', {
                className: 'measurement-input-group'
            }, [
                createLabelForInput(inputId, [createEl('span', {
                    textContent: part
                }), goalDisplay]),
                createInput({
                    type: 'number',
                    id: inputId,
                    'data-part': part,
                    className: 'current-measurement-input',
                    placeholder: `Today's value${prevValue}`,
                    value: currentValueForDate
                }),
                isCustom ? createButton({
                    id: `delete-part-btn-${safePartName}`,
                    content: '<i class="fas fa-trash"></i>',
                    className: 'danger delete-btn measurement-action-btn',
                    'data-action': 'delete-custom-body-part',
                    'data-part': part
                }) : '',
                createButton({
                    id: `set-goal-btn-${safePartName}`,
                    content: goal ? '<i class="fas fa-edit"></i>' : '<i class="fas fa-bullseye"></i>',
                    className: 'set-goal-btn measurement-action-btn',
                    'data-action': 'set-measurement-goal',
                    'data-part': part,
                    title: goal ? 'Edit Goal' : 'Set Goal'
                }), 
                createButton({
                    id: `graph-btn-${safePartName}`,
                    content: '<i class="fas fa-chart-line"></i>',
                    className: 'graph-btn measurement-action-btn',
                    'data-action': 'show-body-part-chart',
                    'data-part': part,
                    title: 'View Graph'
                }) 
            ]);
            inputsContainer.append(inputGroup);
        });
        const addPartInputId = 'new-body-part-input';
        const logMeasurementsCard = createCard({
            header: `Log Measurements for ${getISTDateInfo(new Date(currentLogDate)).displayDate}`
        }, [inputsContainer, createButton({
            id: 'save-measurements-btn',
            content: 'Save Measurements',
            'data-action': 'save-measurements',
            style: 'margin-top: 15px; width: 100%;'
        })]);
        const addPartForm = createCard({
            header: 'Add Custom Body Part'
        }, [createEl('div', {
            className: 'add-item-form'
        }, [
            createLabelForInput(addPartInputId, 'New body part name'), 
            createInput({
                id: addPartInputId,
                placeholder: 'e.g., Left Calf'
            }),
            createButton({
                content: 'Add',
                'data-action': 'add-custom-body-part'
            })
        ])]);
        
        const chartingCard = createCard({
            header: 'Body Trend Analysis'
        }, [
            createEl('div', { id: 'measurement-chart-nav', className: 'adherence-selector-card' },
                allParts.map(part => createButton({
                    content: part,
                    'data-action': 'show-body-part-chart',
                    'data-part': part,
                    className: `adherence-nav-btn ${(selectedBodyPartChart || 'Weight') === part ? 'active' : ''}`
                })).filter(Boolean)
            ),
            createEl('div', { id: 'selected-body-part-chart', className: 'chart-container tall-chart' })
        ]);
        
        setTimeout(() => setBodyPartChart(selectedBodyPartChart || 'Weight'), 0);
        
        const adherenceCard = createCard({
            header: 'Measurement Adherence'
        }, [renderAdherenceCalendar('measurements')]);
        
        return [dateSelector, logMeasurementsCard, addPartForm, adherenceCard, chartingCard];
    }
    
    function setBodyPartChart(partName) {
        const chartContainer = getEl('selected-body-part-chart');
        const canvasId = 'dynamic-measurement-chart';
        
        if (!chartContainer) return;
        
        selectedBodyPartChart = partName; 

        document.querySelectorAll('#measurement-chart-nav .adherence-nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.part === partName) {
                btn.classList.add('active');
            }
        });
        
        if (charts[canvasId]) {
            charts[canvasId].destroy();
            delete charts[canvasId];
        }
        
        chartContainer.innerHTML = `<canvas id="${canvasId}"></canvas>`;
        
        const chartData = getMeasurementTrendDataForPart(partName);
        
        if (chartData.data.datasets[0].data.length > 1) {
            createChart(canvasId, 'line', chartData);
        } else {
            chartContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Not enough data for ${partName} chart. Log more!</p>`;
        }
    }

    
    function renderAdherenceSummaryCard(type) {
        const summaryCard = createCard({ header: "Last 30 Days Adherence" });
        const summaryList = createEl('ul', { className: 'adherence-summary-list' });

        let items = [];
        if (type === 'habits') {
            items = appData.dailyChecklist || [];
        } else if (type === 'abs') {
            items = appData.absMuscleGroups || [];
        } else if (type === 'supplements') {
            items = appData.supplementLibrary || [];
        }

        if (items.length === 0) {
            summaryCard.innerHTML = `<div class="card-header">Last 30 Days Adherence</div><p style="text-align:center; color:var(--text-muted);">No items defined to track.</p>`;
            return summaryCard;
        }

        items.forEach(item => {
            const itemName = item.name || item;
            let consistency;
            if (type === 'habits') {
                consistency = calculateHabitConsistency(itemName, 30);
            } else if (type === 'abs') {
                consistency = calculateAbsConsistency(itemName, 30);
            } else if (type === 'supplements') {
                consistency = calculateSupplementConsistency(item.id, 30);
            }

            const listItem = createEl('li', {}, [
                createEl('span', { textContent: itemName }),
                createEl('span', { textContent: `${consistency.completedDays} days / ${consistency.totalDays} days` })
            ]);
            summaryList.append(listItem);
        });

        summaryCard.append(summaryList);
        return summaryCard;
    }


    function renderPlanOverview() {
        const overviewContainer = createEl('div', {
            className: 'plan-overview-grid'
        });
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        daysOfWeek.forEach(day => {
            const musclesForDay = appData.weeklyMuscleSplits?.[day] || ['Rest'];
            const displayMuscles = musclesForDay.includes('Rest') ? 'Rest' : musclesForDay.join(', ');

            const dayElement = createEl('div', {
                className: 'plan-overview-day',
                'data-action': 'edit-muscle-split',
                'data-day': day,
                style: 'cursor:pointer;'
            }, [
                createEl('div', {
                    className: 'plan-overview-day-name',
                    textContent: day
                }),
                createEl('div', {
                    className: 'plan-overview-muscles',
                    textContent: displayMuscles
                })
            ]);
            overviewContainer.append(dayElement);
        });
        return createCard({
            header: 'Weekly Split Overview'
        }, [overviewContainer]);
    }
    function renderPlan() {
        const activeWeeklyPlan = appData.weeklyPlans?.default;
        if (!activeWeeklyPlan) return createEl('div', { className: 'card-empty-state' }, [createEl('p', { textContent: 'Default weekly plan is unavailable.' })]);

        const headerCard = createCard({ header: 'Weekly Plan', cardClass: 'minimal-dashboard-card' }, [
            createEl('div', { className: 'plan-clean-intro' }, [
                createEl('div', {}, [createEl('strong', { textContent: activeWeeklyPlan.name || 'Default Plan' }), createEl('p', { textContent: 'One plan. Edit it whenever you want.' })]),
                createButton({ content: '<i class="fas fa-rotate-left"></i> Reset Default', 'data-action': 'reset-default-plan', className: 'secondary-button' })
            ])
        ]);

        const dayCards = Object.entries(activeWeeklyPlan.plan || {}).map(([day, data]) => {
            const exerciseList = createEl('div', { className: 'plan-exercise-display-list' });
            if (data?.exercises?.length > 0) {
                data.exercises.forEach((ex, index) => {
                    if (ex?.name) exerciseList.append(createEl('div', { className: 'plan-exercise-row' }, [createEl('span', { className: 'plan-exercise-number', textContent: String(index + 1).padStart(2, '0') }), createEl('strong', { textContent: ex.name })]));
                });
            } else {
                exerciseList.append(createEl('p', { className: 'plan-rest-text', textContent: 'Rest day' }));
            }
            return createCard({ header: `${day} · ${data?.name || 'Rest Day'}`, cardClass: 'minimal-dashboard-card plan-day-card' }, [
                exerciseList,
                createEl('div', { className: 'plan-day-actions' }, [
                    createButton({ content: 'Edit Plan', 'data-action': 'open-plan-edit-modal', 'data-day': day, 'data-weekly-plan-id': 'default' })
                ])
            ]);
        });

        return [headerCard, ...dayCards];
    }

    function resetDefaultWeeklyPlan() {
        const freshDefault = createDefaultData();
        if (!freshDefault?.weeklyPlans?.default) return showToast('Default plan is unavailable.', 'error');
        appData.weeklyPlans.default = JSON.parse(JSON.stringify(freshDefault.weeklyPlans.default));
        appData.settings.activeWeeklyPlan = 'default';
        saveData();
        render('plan');
        render('dashboard');
        showToast('Default weekly plan restored.', 'success');
    }

    function scrollToSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            section.style.transition = 'box-shadow 0.5s ease-in-out';
            section.style.boxShadow = '0 0 20px var(--glow-secondary)';
            setTimeout(() => {
                section.style.boxShadow = '0 4px 15px var(--shadow-color)';
            }, 1000);
        }
    }

    function navigateToProgressAndAnalyze(exerciseName) {
        handleTabClick('progress');
        const searchInput = getEl('progress-search-input');
        const selector = getEl('exercise-select');

        if (searchInput && selector) {
            searchInput.value = exerciseName;
            const newOptions = buildExerciseSelectorOptions(exerciseName);
            selector.innerHTML = '';
            selector.append(...newOptions);

            const optionToSelect = selector.querySelector(`option[value=\"${exerciseName}\"]`);
            if (optionToSelect) {
                optionToSelect.selected = true;
                updateExerciseAnalysis([exerciseName]);
            } else {
                updateExerciseAnalysis([]);
            }
        }
        setTimeout(() => scrollToSection('progress-detailed-progress'), 100);
    }

    // --- SNAPSHOT TAB LOGIC ---
    function setSnapshotHistoryView(view) {
        snapshotHistoryView = view;
        renderedSnapshotCharts.clear();
        render('snapshot');
    }

    function renderSnapshot() {
        let exercisesForSnapshot = [];

        const {
            day: currentDayOfWeek
        } = getISTDateInfo(new Date(currentLogDate));
        const activePlan = appData.weeklyPlans[appData.settings.activeWeeklyPlan];
        const todaysPlan = activePlan?.plan?.[currentDayOfWeek] || {
            exercises: []
        };

        exercisesForSnapshot = currentSessionExercises || todaysPlan.exercises;

        const viewOptionsContainer = createEl('div', {
            className: 'snapshot-view-options-container'
        });
        const views = [{
            label: 'All History',
            value: 'allTime'
        }, {
            label: 'Last 3',
            value: 'last3'
        }, {
            label: 'Last 5',
            value: 'last5'
        }, {
            label: 'This Month',
            value: 'thisMonth'
        }, {
            label: 'This Day',
            value: currentDayOfWeek
        }];

        views.forEach(view => {
            const btn = createButton({
                id: `snapshot-view-btn-${view.value}`,
                content: view.label,
                'data-action': 'set-snapshot-view',
                'data-view': view.value,
                className: snapshotHistoryView === view.value ? 'active' : '',
                style: `background: ${snapshotHistoryView === view.value ? 'var(--glow-secondary)' : 'var(--input-bg)'}; color: ${snapshotHistoryView === view.value ? 'white' : 'var(--text-primary)'};`
            });
            viewOptionsContainer.append(btn);
        });

        const todaysPlanName = loadedCustomWorkoutName || todaysPlan.name || 'No Plan for Today'; // Use loadedCustomWorkoutName if available
        const snapshotHeaderCardContent = [
            createEl('p', {
                innerHTML: `<strong>${todaysPlanName}</strong>`
            }),
            viewOptionsContainer
        ];

        const snapshotHeaderCard = createCard({
            header: `Snapshot - ${getISTDateInfo(new Date(currentLogDate)).displayDate}`,
            cardClass: 'card-enter today-focus'
        }, snapshotHeaderCardContent);

        if (!exercisesForSnapshot || exercisesForSnapshot.length === 0) {
            return [
                snapshotHeaderCard,
                createEl('div', {
                    className: 'card-empty-state'
                }, [
                    createEl('i', {
                        className: 'fas fa-camera-retro'
                    }),
                    createEl('p', {
                        textContent: 'No workout planned or loaded for today. Go to the Log tab to start a session.'
                    })
                ])
            ];
        }

        return [
            snapshotHeaderCard,
            ...renderSnapshotContent(exercisesForSnapshot.map(ex => ex.name))
        ];
    }

    function renderSnapshotContent(exerciseNames) {
        return exerciseNames.map(name => {
            const history = getExerciseHistory(name);
            const isExpanded = expandedSnapshotExercise === name;

            const item = createEl('div', {
                className: `snapshot-exercise-item ${isExpanded ? 'expanded' : ''}`,
                'data-action': 'toggle-snapshot-exercise-details',
                'data-exercise-name': name
            });

            const header = createEl('div', {
                className: 'snapshot-exercise-header'
            }, [
                createEl('span', {
                    textContent: name
                }),
                createEl('div', {
                    style: 'display: flex; align-items: center; gap: 8px;'
                }, [
                    createButton({
                        content: '<i class="fas fa-chart-line"></i>',
                        className: 'exercise-details-icon',
                        'data-action': 'navigate-to-progress-and-analyze',
                        'data-exercise-name': name,
                        title: 'Analyze in Progress Tab'
                    }),
                    createEl('i', {
                        className: 'fas fa-chevron-right toggle-icon'
                    })
                ])
            ]);

            const details = createEl('div', {
                className: 'snapshot-details'
            });
            if (isExpanded) {
                if (history.length > 0) {
                    details.append(renderSnapshotHistory(name, history));
                } else {
                    details.append(createEl('p', {
                        textContent: 'No history for this exercise yet.',
                        style: 'text-align:center; color:var(--text-muted); padding: 10px 0;'
                    }));
                }
            }

            item.append(header, details);
            return item;
        });
    }

function renderSnapshotHistory(exerciseName, rawHistory) {
    const container = createEl('div', { className: 'snapshot-history-table-wrapper' });
    let history = [...rawHistory];

    if (snapshotHistoryView === 'last3') history = history.slice(0, 3);
    else if (snapshotHistoryView === 'last5') history = history.slice(0, 5);
    else if (snapshotHistoryView === 'thisMonth') {
        const firstDayOfMonth = new Date(currentLogDate);
        firstDayOfMonth.setDate(1);
        history = history.filter(log => new Date(log.date) >= firstDayOfMonth);
    } else if (['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(snapshotHistoryView)) {
        history = history.filter(log => getISTDateInfo(new Date(log.date)).day === snapshotHistoryView);
    }

    if (!history.length) {
        container.append(createEl('p', { textContent: 'No matching history found for this view.', className: 'snapshot-empty' }));
        return container;
    }

    const table = createEl('table', { className: 'snapshot-history-table' });
    const thead = createEl('thead');
    const tbody = createEl('tbody');
    thead.append(createEl('tr', {}, [
        createEl('th', { textContent: 'Date' }),
        createEl('th', { textContent: 'Volume' }),
        createEl('th', { textContent: 'Sets' })
    ]));
    table.append(thead);

    history.forEach((log, index) => {
        const volume = log.sets.reduce((total, set) => total + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0);
        const previous = history[index + 1];
        const previousVolume = previous ? previous.sets.reduce((total, set) => total + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0) : null;
        const delta = previousVolume && previousVolume !== 0 ? ((volume - previousVolume) / previousVolume) * 100 : null;
        const trendClass = delta === null ? '' : delta > 0.01 ? 'positive' : delta < -0.01 ? 'negative' : 'stable';
        const deltaText = delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
        const dateText = new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const setsText = log.sets.map(set => `${set.weight}${appData.settings.weightUnit} × ${set.reps}`).join(' · ');

        const row = createEl('tr', { className: trendClass }, [
            createEl('td', {}, [createEl('span', { className: 'snapshot-date', textContent: dateText }), createEl('span', { className: `snapshot-volume-change ${trendClass}`, textContent: deltaText })]),
            createEl('td', { className: 'snapshot-volume-cell', textContent: `${volume.toLocaleString()} ${appData.settings.weightUnit}` }),
            createEl('td', { className: 'snapshot-sets-cell', textContent: setsText || '—' })
        ]);
        tbody.append(row);
    });
    table.append(tbody);
    container.append(table);

    const chartId = `snapshot-mini-chart-${exerciseName.replace(/[^a-z0-9]+/gi, '-')}`;
    const chartContainer = createEl('div', { className: 'snapshot-mini-chart-container' }, [createEl('canvas', { id: chartId })]);
    container.append(chartContainer);
    setTimeout(() => {
        const trendData = getExerciseTrendData(exerciseName);
        if (trendData.data.datasets[0].data.length > 1) {
            createChart(chartId, 'line', {
                data: { labels: trendData.data.datasets[0].data.map(d => d.x), datasets: [{ data: trendData.data.datasets[0].data, label: 'Volume', borderColor: '#63c98b', pointRadius: 2, borderWidth: 2, fill: false }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false, beginAtZero: true }, x: { display: false } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${Number(ctx.raw.y || 0).toLocaleString()} ${appData.settings.weightUnit}` } } } }
            });
        } else {
            chartContainer.innerHTML = '<p class="snapshot-empty">Not enough data for a trend.</p>';
        }
    }, 50);
    return container;
}
           // --- 8. PLAN & TEMPLATE MANAGEMENT (Continued) ---
    function showPlanEditModal(day, weeklyPlanId) {
        const weeklyPlan = appData.weeklyPlans[weeklyPlanId];
        if (!weeklyPlan) return showToast('Weekly plan not found.', 'error');
        const plan = weeklyPlan.plan[day];
        // FIX: Ensure currentModalExercises is a deep copy of the plan's exercises with modal IDs and order
        currentModalExercises = JSON.parse(JSON.stringify(plan.exercises || [])).map((ex, i) => ({
            ...ex,
            modal_id: `exid_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Assign a unique ID for modal manipulation
            originalName: ex.name, 
            order: i + 1, 
            isExpanded: false 
        }));

        const dayPlanNameInputId = 'day-plan-name-input';
        const dayPlanNameInput = createInput({
            type: 'text',
            id: dayPlanNameInputId,
            value: plan.name || '',
            placeholder: 'e.g., Pull Day - Lat Focus'
        });

        const editorBody = [
            createLabelForInput(dayPlanNameInputId, 'Day\'s Plan Name:'),
            dayPlanNameInput,
            createEl('hr', {
                style: 'margin: 15px 0;'
            }),
            ...createPlanEditor('plan', day, weeklyPlanId)
        ];

        const modalFooterContent = [
            createButton({
                id: `cancel-plan-edit-btn-${day}`,
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                id: `save-plan-changes-btn-${day}`,
                content: 'Save Changes',
                onclick: () => savePlan(day, weeklyPlanId)
            })
        ];

        openModal(`Edit Plan for ${day} (${weeklyPlan.name})`, editorBody, modalFooterContent);
        renderPlanEditorList('plan', day, weeklyPlanId);
    }

    function showMuscleSplitEditModal(day) {
        const currentSplit = appData.weeklyMuscleSplits[day] || [];
        const allPossibleMuscleGroups = getAllMuscleGroups().filter(g => g !== 'Other' && g !== 'Rest');

        const bodyContent = [
            createEl('p', {
                textContent: `Select muscle groups for ${day}:`
            }),
            createEl('div', {
                id: 'muscle-split-edit-container',
                style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 10px;'
            },
                allPossibleMuscleGroups.map(group => {
                    const checkboxId = `muscle-group-${group.replace(/\s/g, '-')}`;
                    return createEl('div', {
                        className: 'checklist-item'
                    }, [
                        createInput({
                            type: 'checkbox',
                            id: checkboxId,
                            name: 'muscle-group',
                            value: group,
                            checked: currentSplit.includes(group)
                        }),
                        createEl('label', {
                            htmlFor: checkboxId,
                            textContent: group
                        })
                    ]);
                })
            ),
            createEl('div', {
                className: 'add-item-form',
                style: 'margin-top: 20px;'
            }, [
                createLabelForInput('new-custom-muscle-group-input', 'Add new custom muscle group'),
                createInput({
                    id: 'new-custom-muscle-group-input',
                    placeholder: 'e.g., Forearms'
                }),
                createButton({
                    content: 'Add',
                    onclick: () => {
                        const input = getEl('new-custom-muscle-group-input');
                        const newGroup = input.value.trim();
                        if (newGroup && !getAllMuscleGroups().map(g => g.toLowerCase()).includes(newGroup.toLowerCase())) {
                            appData.customMuscleGroups.push(newGroup);
                            saveData();
                            showToast(`Custom muscle group "${newGroup}" added!`, 'success');
                            closeModal(true);
                            showMuscleSplitEditModal(day);
                        } else if (newGroup) {
                            showToast('Muscle group already exists or is invalid.', 'error');
                        }
                    }
                })
            ])
        ];

        openModal(`Edit ${day} Muscle Split`, bodyContent, [
            createButton({
                id: `cancel-muscle-split-edit-${day}`,
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                id: `save-muscle-split-${day}`,
                content: 'Save Split',
                'data-action': 'save-muscle-split',
                'data-day': day
            })
        ], true);
    }

    async function createNewWeeklyTemplatePrompt() {
        const templateName = await showPrompt('Enter name for new weekly template:');
        if (!templateName) return;
        if (appData.weeklyPlans[templateName]) {
            return showToast('A template with this name already exists.', 'error');
        }

        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const newPlanStructure = {};
        daysOfWeek.forEach(day => {
            newPlanStructure[day] = {
                name: `${day} Workout`,
                exercises: []
            };
        });

        appData.weeklyPlans[templateName] = {
            name: templateName,
            plan: newPlanStructure
        };
        appData.settings.activeWeeklyPlan = templateName;
        saveData();
        render('plan');
        showToast(`New template "${templateName}" created and set as active!`, 'success');
    }

    function setActiveWeeklyTemplate(templateName) {
        if (appData.weeklyPlans[templateName]) {
            appData.settings.activeWeeklyPlan = templateName;
            currentSessionExercises = null;
            loadedCustomWorkoutName = null;
            saveData();
            render('plan');
            render('dashboard'); 
            render('log'); 
            render('snapshot'); 
            showToast(`Active plan set to "${templateName}".`, 'info');
        } else {
            showToast('Template not found.', 'error');
        }
    }

    async function deleteWeeklyTemplate(templateName) {
        if (templateName === appData.settings.activeWeeklyPlan) {
            showToast('Cannot delete the currently active plan. Please set another plan as active first.', 'error');
            return;
        }
        if (Object.keys(appData.weeklyPlans).length <= 1) {
            showToast('Cannot delete the last remaining plan.', 'error');
            return;
        }

        if (await showConfirmation(`Are you sure you want to delete the plan "${appData.weeklyPlans[templateName].name}"? This cannot be undone.`)) {
            delete appData.weeklyPlans[templateName];
            saveData();
            render('plan');
            showToast(`Plan "${templateName}" deleted.`, 'info');
        }
    }

    async function showCopyDayPlanModal(sourceDay, sourceWeeklyPlanId) {
        const sourcePlan = appData.weeklyPlans[sourceWeeklyPlanId].plan[sourceDay];
        if (!sourcePlan) return showToast('Source day plan not found.', 'error');

        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const targetDayOptions = daysOfWeek.map(day => {
            const checkboxId = `copy-to-day-${day}`;
            return createEl('div', {
                className: 'checklist-item'
            }, [
                createInput({
                    type: 'checkbox',
                    id: checkboxId,
                    name: 'copy-to-day',
                    value: day
                }),
                createEl('label', {
                    htmlFor: checkboxId,
                    textContent: day
                })
            ]);
        });

        const templateOptions = Object.keys(appData.weeklyPlans).map(planId =>
            createEl('option', {
                value: planId,
                textContent: appData.weeklyPlans[planId].name
            })
        );
        const copyToTemplateSelectId = 'copy-to-template-select';
        openModal(`Copy ${sourceDay} Plan`, [
            createEl('p', {
                textContent: `Copying plan from "${sourceDay}" in "${appData.weeklyPlans[sourceWeeklyPlanId].name}".`
            }),
            createLabelForInput(copyToTemplateSelectId, 'Copy to Weekly Template:'),
            createEl('select', {
                id: copyToTemplateSelectId,
                name: copyToTemplateSelectId,
                onchange: () => { }
            }, templateOptions),
            createEl('p', {
                textContent: 'Select target day(s):'
            }),
            createEl('div', {
                className: 'copy-day-options-grid'
            }, targetDayOptions)
        ], [
            createButton({
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                content: 'Copy',
                onclick: () => copyDayPlan(sourceDay, sourceWeeklyPlanId)
            })
        ]);
    }

    async function copyDayPlan(sourceDay, sourceWeeklyPlanId) {
        const targetTemplateId = getEl('copy-to-template-select').value;
        const targetDays = Array.from(document.querySelectorAll('input[name="copy-to-day"]:checked')).map(cb => cb.value);

        if (!targetTemplateId || targetDays.length === 0) {
            return showToast('Please select a target template and at least one day.', 'error');
        }

        const sourcePlan = appData.weeklyPlans[sourceWeeklyPlanId].plan[sourceDay];
        if (!sourcePlan) return showToast('Source day plan not found.', 'error');

        targetDays.forEach(day => {
            appData.weeklyPlans[targetTemplateId].plan[day] = JSON.parse(JSON.stringify(sourcePlan));
        });
        saveData();
        render('plan');
        showToast(`Plan copied successfully!`, 'success');
        closeModal();
    }

    async function copyWeeklyPlan(sourceWeeklyPlanId) {
        const newPlanName = getEl('new-weekly-plan-name').value.trim();
        if (!newPlanName) return showToast('New plan name cannot be empty.', 'error');
        if (appData.weeklyPlans[newPlanName]) return showToast('A plan with this name already exists.', 'error');

        const sourcePlan = appData.weeklyPlans[sourceWeeklyPlanId];
        if (!sourcePlan) return showToast('Source plan not found.', 'error');

        appData.weeklyPlans[newPlanName] = JSON.parse(JSON.stringify(sourcePlan));
        appData.weeklyPlans[newPlanName].name = newPlanName; 
        saveData();
        render('plan');
        showToast(`Weekly plan "${sourcePlan.name}" copied to "${newPlanName}"!`, 'success');
        closeModal();
    }

    function createPlanEditor(context, contextName, weeklyPlanId = null) {
        const searchContainer = createEl('div', {
            className: 'plan-editor-search-container'
        });
        const searchInputId = 'plan-exercise-search';
        const searchInput = createInput({
            type: 'text',
            id: searchInputId,
            placeholder: 'Search or type new exercise...'
        });
        const searchLabel = createLabelForInput(searchInputId, 'Search exercises', 'sr-only');

        const searchResults = createEl('div', {
            id: 'plan-search-results',
            className: 'plan-search-results'
        });

        searchInput.oninput = debounce(() => {
            const query = searchInput.value.trim();
            renderPlanSearch(query, searchResults, context, contextName, weeklyPlanId);
        }, 300);

        searchContainer.append(searchLabel, searchInput, searchResults);

        const list = createEl('div', {
            id: `${context}-${contextName}-editor-list`,
            className: 'plan-exercise-list'
        });

        return [searchContainer, list];
    }

    function renderPlanSearch(query, container, context, contextName, weeklyPlanId) {
        container.innerHTML = '';
        const lowerQuery = query.toLowerCase();
        const allExercises = [...new Set((appData.exerciseDatabase || []).map(e => e.name))].sort();
        const filteredExercises = allExercises.filter(name => name.toLowerCase().includes(lowerQuery));

        if (query && !filteredExercises.some(name => name.toLowerCase() === lowerQuery)) {
            container.prepend(createEl('div', {
                className: 'plan-search-item quick-add',
                innerHTML: `<i class="fas fa-plus-circle"></i> Add "<strong>${query}</strong>" to Plan & Database`,
                'data-action': 'add-exercise-to-plan-from-search',
                'data-name': query,
                'data-context': context,
                'data-context-name': contextName,
                'data-weekly-plan-id': weeklyPlanId
            }));
        }

        filteredExercises.forEach(name => {
            container.append(createEl('div', {
                className: 'plan-search-item',
                'data-action': 'add-exercise-to-plan-from-search',
                'data-name': name,
                'data-context': context,
                'data-context-name': contextName,
                'data-weekly-plan-id': weeklyPlanId
            }, name));
        });

        container.style.display = (query.length > 0 && (filteredExercises.length > 0 || query)) ? 'block' : 'none';
    }

    // FIX: Centralized logic to render/re-render the list based on currentModalExercises
    function renderPlanEditorList(context, contextName, weeklyPlanId = null) {
        const listContainer = getEl(`${context}-${contextName}-editor-list`);
        if (!listContainer) return;
        listContainer.innerHTML = '';
        
        currentModalExercises.forEach(ex => {
            const isExpanded = ex.isExpanded;
            const item = createEl('div', {
                className: `plan-exercise-item ${isExpanded ? 'expanded' : ''}`,
                'data-modal-id': ex.modal_id,
                'data-order': ex.order,
            });
            
            const header = createEl('div', {
                className: 'plan-exercise-item-header-compact', 
            }, [
                createEl('div', { className: 'plan-order-buttons' }, [
                    createButton({
                        content: '<i class="fas fa-arrow-up"></i>',
                        className: 'small-icon-btn transparent-bg',
                        'data-action': 'move-plan-exercise-up', 
                        'data-modal-id': ex.modal_id,
                        disabled: ex.order === 1
                    }),
                    createButton({
                        content: '<i class="fas fa-arrow-down"></i>',
                        className: 'small-icon-btn transparent-bg',
                        'data-action': 'move-plan-exercise-down', 
                        'data-modal-id': ex.modal_id,
                        disabled: ex.order === currentModalExercises.length
                    }),
                ]),
                
                createEl('span', {
                    className: 'plan-exercise-order',
                    textContent: `${ex.order}.`
                }),
                
                createEl('span', {
                    className: 'plan-exercise-name-compact',
                    textContent: ex.name
                }),
                
                createButton({
                    content: '<i class="fas fa-edit"></i>',
                    className: 'small-icon-btn transparent-bg edit-toggle-btn', 
                    'data-action': 'toggle-plan-exercise-details', 
                    'data-modal-id': ex.modal_id,
                    title: 'Edit Details'
                }),

                createEl('div', {
                    className: 'plan-exercise-actions'
                }, [
                    createButton({
                        content: '<i class="fas fa-trash"></i>',
                        className: 'danger delete-btn small-icon-btn',
                        // Removed direct onclick, relying on delegated listener for immediate update logic
                        'data-modal-id': ex.modal_id,
                        title: 'Delete Exercise'
                    })
                ])
            ]);

            const exerciseNameInputId = `name-input-${ex.modal_id}`;
            const setsInputId = `sets-input-${ex.modal_id}`;

            const details = createEl('div', {
                className: 'plan-exercise-details-simplified'
            }, [
                createEl('div', {
                    className: 'plan-exercise-detail-item'
                }, [
                    createLabelForInput(exerciseNameInputId, 'Exercise Name'),
                    createInput({
                        type: 'text',
                        id: exerciseNameInputId,
                        value: ex.name,
                        oninput: (e) => updateExerciseProperty(ex.modal_id, 'name', e.target.value)
                    })
                ]),
                createEl('div', {
                    className: 'plan-exercise-detail-item'
                }, [
                    createLabelForInput(setsInputId, 'Sets (default: 3)'),
                    createInput({
                        type: 'number',
                        id: setsInputId,
                        value: ex.sets || '3', 
                        placeholder: 'e.g., 3',
                        oninput: (e) => updateExerciseProperty(ex.modal_id, 'sets', e.target.value)
                    })
                ]),
                createInput({
                    type: 'hidden',
                    id: `reps-input-${ex.modal_id}`,
                    value: ex.reps,
                    oninput: (e) => updateExerciseProperty(ex.modal_id, 'reps', e.target.value)
                })
            ]);

            item.append(header, details);
            listContainer.append(item);
        });
    }

    // FIX: Optimized move function to update DOM immediately without full re-render
    function movePlanExercise(modalId, direction) {
        const index = currentModalExercises.findIndex(ex => ex.modal_id === modalId);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= currentModalExercises.length) return;

        // 1. Swap the elements in the *data* array
        [currentModalExercises[index], currentModalExercises[newIndex]] = [currentModalExercises[newIndex], currentModalExercises[index]];

        // 2. Re-assign orders
        currentModalExercises = currentModalExercises.map((ex, i) => ({
            ...ex,
            order: i + 1
        }));

        // 3. Update the DOM elements' order numbers and button disabled states (Efficient DOM update)
        const currentItem = document.querySelector(`.plan-exercise-item[data-modal-id=\"${modalId}\"]`);
        const targetModalId = currentModalExercises[newIndex].modal_id; // The new index now holds the item we swapped into its place
        const targetItem = document.querySelector(`.plan-exercise-item[data-modal-id=\"${targetModalId}\"]`);
        
        if (currentItem && targetItem) {
             const listContainer = currentItem.parentNode;
             if (direction === -1) { // Move Up
                 listContainer.insertBefore(currentItem, targetItem);
             } else { // Move Down
                 listContainer.insertBefore(currentItem, targetItem.nextSibling);
             }
        }
        
        // 4. Update the visual order numbers and button states for *all* visible items
        document.querySelectorAll('.plan-exercise-item').forEach(el => {
            const id = el.dataset.modalId;
            const data = currentModalExercises.find(ex => ex.modal_id === id);
            
            if (data) {
                const isFirst = data.order === 1;
                const isLast = data.order === currentModalExercises.length;
                
                el.querySelector('.plan-exercise-order').textContent = `${data.order}.`;
                
                const upBtn = el.querySelector('[data-action="move-plan-exercise-up"]');
                const downBtn = el.querySelector('[data-action="move-plan-exercise-down"]');
                
                if (upBtn) upBtn.disabled = isFirst;
                if (downBtn) downBtn.disabled = isLast;
            }
        });
    }

    function updateExerciseOrder(modalId, newOrder) {
        const newOrderInt = parseInt(newOrder);
        if (isNaN(newOrderInt) || newOrderInt < 1 || newOrderInt > currentModalExercises.length) return;

        const originalIndex = currentModalExercises.findIndex(ex => ex.modal_id === modalId);
        if (originalIndex === -1 || originalIndex === newOrderInt - 1) return;

        const [movedExercise] = currentModalExercises.splice(originalIndex, 1);
        currentModalExercises.splice(newOrderInt - 1, 0, movedExercise);

        currentModalExercises = currentModalExercises.map((ex, i) => ({
            ...ex,
            order: i + 1
        }));

        renderPlanEditorList('plan', 'day', 'default');
    }

    function togglePlanExerciseDetails(modalId) {
        const exercise = currentModalExercises.find(ex => ex.modal_id === modalId);
        if (exercise) {
            currentModalExercises.forEach(ex => {
                if (ex.modal_id !== modalId) ex.isExpanded = false;
            });

            exercise.isExpanded = !exercise.isExpanded;
            const listContainer = document.querySelector('.plan-exercise-list');
            const context = listContainer.id.split('-')[0];
            const contextName = listContainer.id.split('-')[1];
            renderPlanEditorList(context, contextName);
        }
    }

    function updateExerciseProperty(modalId, property, value) {
        const exercise = currentModalExercises.find(ex => ex.modal_id === modalId);
        if (exercise) {
            exercise[property] = value;
        }
    }

    // FIX: Function updated to re-render the list immediately
    // FIX: Function updated to accept context and re-render the correct list
    function deletePlanExercise(modalId, context, contextName, weeklyPlanId = null) {
        currentModalExercises = currentModalExercises.filter(ex => ex.modal_id !== modalId);
        currentModalExercises = currentModalExercises.map((ex, i) => ({
            ...ex,
            order: i + 1
        }));
        // Use the passed-in context instead of hardcoded values
        renderPlanEditorList(context, contextName, weeklyPlanId);
    }

    function addExerciseToPlan(exerciseName, context, contextName, weeklyPlanId) {
        if (exerciseName.trim()) {
            addNewExerciseToDatabase(exerciseName);
            const newOrder = currentModalExercises.length + 1;
            currentModalExercises.push({
                name: exerciseName.trim(),
                sets: '3',
                reps: '', 
                modal_id: `exid_new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                originalName: exerciseName.trim(),
                order: newOrder,
                isExpanded: false
            });
            renderPlanEditorList(context, contextName, weeklyPlanId);
            showToast(`"${exerciseName}" added to plan!`, 'success');
        } else {
            showToast('Exercise name cannot be empty.', 'error');
        }
    }

    function showExerciseSelectionForPlanModal(context, contextName, weeklyPlanId) {
        const allExercises = [...new Set((appData.exerciseDatabase || []).map(e => e.name))].sort();
        const searchInputId = 'plan-exercise-search';
        const searchInput = createInput({
            type: 'text',
            id: searchInputId,
            placeholder: 'Search or add new exercise...'
        });
        const searchLabel = createLabelForInput(searchInputId, 'Search for exercises', 'sr-only');
        const listContainer = createEl('div', {
            style: 'max-height: 300px; overflow-y: auto; margin-top: 10px;'
        });

        const renderList = (filter = '') => {
            listContainer.innerHTML = '';
            const lowerFilter = filter.toLowerCase();
            const filteredDb = allExercises.filter(name => name.toLowerCase().includes(lowerFilter));

            if (filter && !filteredDb.some(name => name.toLowerCase() === lowerFilter)) {
                listContainer.prepend(createEl('div', {
                    className: 'list-item list-item-new',
                    innerHTML: `<i class="fas fa-plus"></i> Add "<strong>${filter}</strong>" to Plan & Database`,
                    style: 'cursor:pointer;',
                    'data-action': 'add-exercise-to-plan-from-search',
                    'data-name': filter,
                    'data-context': context,
                    'data-context-name': contextName,
                    'data-weekly-plan-id': weeklyPlanId
                }));
            }

            filteredDb.forEach(name => listContainer.append(createEl('div', {
                className: 'list-item',
                'data-action': 'add-exercise-to-plan-from-search',
                'data-name': name,
                textContent: name,
                style: 'cursor:pointer;'
            })));
        };

        searchInput.oninput = () => renderList(searchInput.value.trim());
        openModal('Add Exercise to Plan', [searchLabel, searchInput, listContainer]);
        renderList();
    }

    // --- 9. CUSTOM WORKOUT & SNAPSHOT MANAGEMENT (Partial) ---
    function renderCustomWorkoutsManager() {
        const container = createEl('div', {
            id: 'custom-workouts-container'
        });

        Object.keys(appData.customWorkouts || {}).forEach(name => {
            const safeName = name.replace(/\s+/g, '-').toLowerCase();
            container.append(createEl('div', {
                className: 'list-item'
            }, [
                createEl('span', {
                    textContent: name
                }),
                createEl('div', {
                    style: 'display: flex; gap: 5px;'
                }, [
                    createButton({
                        id: `edit-custom-workout-btn-${safeName}`,
                        content: '<i class="fas fa-edit"></i>',
                        'data-action': 'edit-custom-workout',
                        'data-name': name,
                        title: 'Edit Workout'
                    }),
                    createButton({
                        id: `delete-custom-workout-btn-${safeName}`,
                        content: '<i class="fas fa-trash"></i>',
                        className: 'danger',
                        'data-action': 'delete-custom-workout',
                        'data-name': name,
                        title: 'Delete Workout'
                    })
                ])
            ]));
        });

        const addBtn = createButton({
            id: 'create-custom-workout-btn',
            content: '<i class="fas fa-plus"></i> Create New Custom Workout',
            'data-action': 'create-custom-workout',
            style: 'margin-top: 15px; width: 100%;'
        });

        return createCard({
            header: 'My Custom Workouts'
        }, [container, addBtn]);
    }

    function showCustomWorkoutModal(name = null) {
        const isEditing = name !== null;
        const workout = isEditing ? appData.customWorkouts[name] : {
            exercises: []
        };
        currentModalExercises = JSON.parse(JSON.stringify(workout.exercises)).map((ex, i) => ({
            ...ex,
            modal_id: `exid_${i}_${Date.now()}`,
            originalName: ex.name,
            order: i + 1,
            isExpanded: false
        }));
        
        const nameInputId = 'custom-workout-name-input';
        const nameInput = createInput({
            type: 'text',
            id: nameInputId,
            value: isEditing ? name : '',
            placeholder: 'e.g., Arms Annihilation',
            readOnly: isEditing
        });

        const editorBody = [
            createLabelForInput(nameInputId, 'Workout Name'),
            nameInput,
            createEl('hr', {
                style: 'margin: 15px 0;'
            }),
            ...createPlanEditor('customWorkout', 'editor')
        ];

        const modalFooterContent = [
            createButton({
                id: 'cancel-custom-workout-btn',
                content: 'Cancel',
                'data-action': 'close-modal'
            }),
            createButton({
                id: 'save-custom-workout-btn',
                content: 'Save Workout',
                'data-action': 'save-custom-workout'
            })
        ];

        openModal(
            isEditing ? 'Edit Custom Workout' : 'Create Custom Workout',
            editorBody,
            modalFooterContent
        );
        renderPlanEditorList('customWorkout', 'editor');
    }

    function saveCustomWorkout() {
        const nameInput = getEl('custom-workout-name-input');
        const workoutName = nameInput.value.trim();

        if (!workoutName) return showToast('Workout name cannot be empty.', 'error');
        if (appData.customWorkouts[workoutName] && !nameInput.readOnly) return showToast('A custom workout with this name already exists.', 'error');

        const exercisesToSave = currentModalExercises
            .filter(ex => ex.name.trim() !== '')
            .map(({
                modal_id,
                ...rest
            }) => {
                if (rest.originalName && rest.name !== rest.originalName) {
                    addNewExerciseToDatabase(rest.name);
                }
                return rest;
            });

        appData.customWorkouts[workoutName] = {
            exercises: exercisesToSave
        };
        saveData();
        closeModal();
        render('plan');
        showToast(`Custom workout "${workoutName}" saved!`, 'success');
    }

    async function deleteCustomWorkout(name) {
        if (await showConfirmation(`Are you sure you want to delete the "${name}" workout? This cannot be undone.`)) {
            delete appData.customWorkouts[name];
            saveData();
            render('plan');
            showToast(`Workout "${name}" deleted.`, 'info');
        }
    }

    function showLoadWorkoutModal() {
        const customWorkouts = appData.customWorkouts || {};
        let bodyContent;

        if (Object.keys(customWorkouts).length === 0) {
            bodyContent = [createEl('p', {
                textContent: 'You have not created any custom workouts yet. Go to the Plan tab to create one!'
            })];
        } else {
            const listContainer = createEl('div', {
                style: 'display: flex; flex-direction: column; gap: 10px;'
            });
            Object.keys(customWorkouts).sort().forEach(name => {
                const safeName = name.replace(/\s+/g, '-').toLowerCase();
                listContainer.append(createButton({
                    id: `load-workout-btn-${safeName}`,
                    content: name,
                    'data-action': 'load-custom-workout-to-log',
                    'data-name': name,
                    style: 'width: 100%; justify-content: flex-start; text-align: left;'
                }));
            });
            bodyContent = [listContainer];
        }

        openModal('Load a Custom Workout', bodyContent, [createButton({
            content: 'Cancel',
            'data-action': 'close-modal'
        })]);
    }

    function loadCustomWorkoutToLog(workoutName) {
        const workout = appData.customWorkouts[workoutName];
        if (!workout || !workout.exercises) return showToast('Could not load workout.', 'error');

        currentSessionExercises = JSON.parse(JSON.stringify(workout.exercises)).map((ex, index) => ({
            ...ex,
            log_id: `log_ex_${index}_${Date.now()}` // Assign unique ID
        }));
        loadedCustomWorkoutName = workoutName; 

        closeModal();
        showToast(`Loaded "${workoutName}".`, 'success');

        if (document.getElementById('log').classList.contains('active')) {
            render('log');
        }
        if (document.getElementById('snapshot').classList.contains('active')) {
            render('snapshot');
        }
        render('dashboard'); 
    }

    // NEW FEATURE: Exercise Swapping & On-the-Fly Additions
    function renderSwapExerciseResults(searchTerm, listContainer, originalExerciseName) {
        listContainer.innerHTML = '';
        const allExercises = [...new Set((appData.exerciseDatabase || []).map(e => e.name))].sort();
        const lowerFilter = searchTerm.toLowerCase();
        const originalMuscleGroup = appData.exerciseDatabase.find(ex => ex.name === originalExerciseName)?.muscle || guessMuscleGroup(originalExerciseName);
        const filteredDb = allExercises.filter(name => name.toLowerCase().includes(lowerFilter) && name !== originalExerciseName);

        if (searchTerm && !filteredDb.some(name => name.toLowerCase() === lowerFilter)) {
            listContainer.prepend(createEl('div', {
                className: 'list-item list-item-new',
                innerHTML: `<i class="fas fa-plus"></i> Add and Swap to "<strong>${searchTerm}</strong>"`,
                'data-action': 'add-and-swap-exercise',
                'data-original-exercise': originalExerciseName,
                'data-new-exercise': searchTerm
            }));
        }

        const sameMuscleGroup = filteredDb.filter(name => {
            const muscle = appData.exerciseDatabase.find(ex => ex.name === name)?.muscle || guessMuscleGroup(name);
            return muscle === originalMuscleGroup;
        }).sort();
        const otherExercises = filteredDb.filter(name => {
            const muscle = appData.exerciseDatabase.find(ex => ex.name === name)?.muscle || guessMuscleGroup(name);
            return muscle !== originalMuscleGroup;
        }).sort();

        [...sameMuscleGroup, ...otherExercises].forEach(name => {
            listContainer.append(createEl('div', {
                className: 'list-item',
                textContent: name,
                'data-action': 'swap-exercise-in-log',
                'data-original-exercise': originalExerciseName,
                'data-new-exercise': name
            }));
        });

        if (filteredDb.length === 0 && !searchTerm) {
            listContainer.append(createEl('p', {
                textContent: 'No other exercises found. Try searching or adding a new one.',
                style: 'text-align:center; color:var(--text-muted); padding: 10px 0;'
            }));
        }
    }

    function showSwapExerciseModal(originalExerciseName, searchTerm = '') {
        const originalExercise = currentSessionExercises.find(ex => ex.name === originalExerciseName);
        if (!originalExercise) {
            return showToast('Original exercise not found in current log session.', 'error');
        }

        const searchInputId = 'swap-exercise-search-input';
        const listContainerId = 'swap-exercise-results-list';

        const searchInput = createInput({
            type: 'text',
            id: searchInputId,
            placeholder: 'Search or type new exercise...',
            value: searchTerm,
            'data-original-exercise': originalExerciseName
        });
        const searchLabel = createLabelForInput(searchInputId, 'Search for an exercise to swap', 'sr-only');
        const listContainer = createEl('div', {
            id: listContainerId, 
            style: 'max-height: 300px; overflow-y: auto; margin-top: 10px;'
        });

        openModal(`Swap "${originalExerciseName}"`, [searchLabel, searchInput, listContainer]);

        renderSwapExerciseResults(searchTerm, listContainer, originalExerciseName);
    }
    
    function swapExerciseInLog(originalExerciseName, newExerciseName) {
        const index = currentSessionExercises.findIndex(ex => ex.name === originalExerciseName);
        if (index > -1) {
            currentSessionExercises[index] = {
                ...currentSessionExercises[index],
                name: newExerciseName,
                substitutedFor: originalExerciseName 
            };
            addNewExerciseToDatabase(newExerciseName); 
            closeModal(true);
            render('log'); 
            showToast(`"${originalExerciseName}" swapped for "${newExerciseName}".`, 'success');
        } else {
            showToast('Could not find original exercise in current log session.', 'error');
        }
    }

    function addAndSwapExercise(originalExerciseName, newExerciseName) {
        addNewExerciseToDatabase(newExerciseName);
        swapExerciseInLog(originalExerciseName, newExerciseName);
    }
    
    // --- 10. HELPER & UTILITY FUNCTIONS ---
    function getISTDateInfo(date = new Date()) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(d.getDate()).padStart(2, '0');
        const dayName = d.toLocaleDateString('en-US', {
            weekday: 'long'
        }); 

        const shortDisplayDate = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }); 
        
        return {
            date: `${year}-${month}-${dayOfMonth}`, // YYYY-MM-DD
            day: dayName, 
            displayDate: d.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }), 
            shortDisplayDate: shortDisplayDate, 
        };
    }

    function createEl(tag, attributes = {}, content) {
        const el = document.createElement(tag);
        if (tag === 'svg' || tag === 'path' || tag === 'text' || tag === 'circle') { 
            Object.keys(attributes).forEach(key => el.setAttribute(key, attributes[key]));
        } else {
            for (const key in attributes) {
                if (key === 'className' && attributes[key].includes('sr-only')) {
                    el.className = attributes[key];
                    Object.assign(el.style, {
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        padding: '0',
                        margin: '-1px',
                        overflow: 'hidden',
                        clip: 'rect(0, 0, 0, 0)',
                        whiteSpace: 'nowrap',
                        borderWidth: '0'
                    });
                } else if (key === 'className') {
                    el.className = attributes[key];
                } else if (key.startsWith('data-')) {
                    el.dataset[key.substring(5).replace(/-(\w)/g, (m, g) => g.toUpperCase())] = attributes[key];
                } else {
                    el[key] = attributes[key];
                }
            }
        }
        if (content) {
            if (Array.isArray(content)) el.append(...content.filter(Boolean));
            else if (content instanceof Node) el.append(content);
            else if (typeof content === 'string') el.innerHTML = content;
        }
        return el;
    }

    function createLabelForInput(forId, content, className = '') {
        const labelEl = createEl('label', {
            htmlFor: forId,
            className: className
        });
        if (Array.isArray(content)) {
            labelEl.append(...content);
        } else {
            labelEl.textContent = content;
        }
        return labelEl;
    }

    function createIcon(className, positionClass = '') {
        return createEl('i', {
            className: `fas ${className} adherence-icon-overlay ${positionClass}`
        });
    }

    function createCard(options = {}, content) {
        const {
            header,
            cardClass,
            headerAction,
            id
        } = options;
        const card = createEl('div', {
            className: `card ${cardClass || ''}`,
            id: id || ''
        });
        if (header) {
            const headerEl = createEl('div', {
                className: 'card-header'
            });
            const headerContent = createEl('span', {
                'data-action': headerAction ? headerAction['data-action'] : '',
                'data-exercise-name': headerAction ? headerAction['data-exercise-name'] : ''
            }, header);
            if (headerAction) {
                headerContent.style.cursor = 'pointer';
            }
            headerEl.append(headerContent);
            if (!card.classList.contains('today-focus') && !card.classList.contains('motivation-card') && !card.classList.contains('workout-streak-card') && !card.id.includes('water-intake-card')) {
                headerEl.classList.add(GRADIENT_CLASSES[cardHeaderColorIndex]);
                cardHeaderColorIndex = (cardHeaderColorIndex + 1) % GRADIENT_CLASSES.length;
            }
            card.append(headerEl);
        }
        if (content) card.append(...(Array.isArray(content) ? content : [content]));
        return card;
    }
    function createButton(options = {}) {
        const {
            content,
            ...attrs
        } = options;
        return createEl('button', attrs, content);
    }
    function createInput(attributes) {
        return createEl('input', {
            ...attributes,
            name: attributes.id
        });
    }
    function createKPI(label, value, subtitle = '', trend = null, percentage = null) {
        const valueEl = createEl('div', {
            className: 'kpi-value'
        });
        const labelEl = createEl('div', {
            className: 'kpi-label',
            textContent: label
        });

        if (percentage !== null) {
            const radius = 20; 
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (percentage / 100) * circumference;
            const strokeColor = percentage >= 75 ? 'var(--glow-success)' : (percentage >= 50 ? 'var(--glow-primary)' : 'var(--glow-danger)');

            const svg = createEl('svg', {
                width: 50,
                height: 50,
                viewBox: '0 0 50 50',
                className: 'kpi-progress-ring'
            }, [
                createEl('circle', {
                    className: 'kpi-progress-ring-bg',
                    cx: 25,
                    cy: 25,
                    r: radius,
                    stroke: 'rgba(255,255,255,0.1)',
                    'stroke-width': 4,
                    fill: 'none',
                }),
                createEl('circle', {
                    className: 'kpi-progress-ring-fill',
                    cx: 25,
                    cy: 25,
                    r: radius,
                    stroke: strokeColor,
                    'stroke-width': 4,
                    'stroke-dasharray': circumference,
                    'stroke-dashoffset': strokeDashoffset,
                    'stroke-linecap': 'round',
                    fill: 'none',
                    style: 'transition: stroke-dashoffset 0.5s ease-out, stroke 0.3s ease;'
                }),
                createEl('text', {
                    x: '50%',
                    y: '50%',
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    'font-size': '0.7em',
                    'font-weight': 'bold',
                    fill: 'var(--text-primary)'
                }, `${percentage.toFixed(0)}%`)
            ]);
            valueEl.append(svg);
        } else {
            valueEl.textContent = value;
        }


        if (subtitle) {
            labelEl.append(createEl('span', {
                style: 'display: block; font-size: 0.8em;'
            }, subtitle));
        }

        let trendIcon = '';
        if (trend === 'up') trendIcon = '<i class="fas fa-arrow-up" style="color: var(--glow-success); margin-left: 5px;"></i>';
        else if (trend === 'down') trendIcon = '<i class="fas fa-arrow-down" style="color: var(--glow-danger); margin-left: 5px;"></i>';
        else if (trend === 'stable') trendIcon = '<i class="fas fa-minus" style="color: var(--text-muted); margin-left: 5px;"></i>';

        const kpiItem = createEl('div', {
            className: 'kpi-item'
        }, [valueEl, labelEl]);
        if (trendIcon && percentage === null) { 
            valueEl.innerHTML += trendIcon;
        }
        return kpiItem;
    }

    function getTrend(currentValue, previousValue, lowerIsBetter = false) {
        if (currentValue === 'N/A' || previousValue === 'N/A' || currentValue === null || previousValue === null || isNaN(currentValue) || isNaN(previousValue)) {
            return null;
        }
        if (currentValue > previousValue) {
            return lowerIsBetter ? 'down' : 'up';
        } else if (currentValue < previousValue) {
            return lowerIsBetter ? 'up' : 'down';
        } else {
            return 'stable';
        }
    }

    function getPreviousWeekSaturdayMeasurement(partName, beforeDate = null) {
        const today = beforeDate ? new Date(beforeDate) : new Date();
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        return findLatestSaturdayMeasurementLog(oneWeekAgo)?.data?.[partName] ?? null;
    }

    function getPreviousWeekSaturdayBFP(beforeDate = null) {
        const today = beforeDate ? new Date(beforeDate) : new Date();
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(today.getDate() - 7);
        return calculateBFPForSpecificLog(findLatestSaturdayMeasurementLog(oneWeekAgo));
    }

    function getPreviousWeekWorkoutStreak() {
        const today = new Date();
        const oneWeekAgo = new Date(today.setDate(today.getDate() - 7));
        return calculateWorkoutStreak(oneWeekAgo);
    }

    function getPreviousWeekPlanAdherence(days = 30) {
        const today = new Date();
        const oneWeekAgo = new Date(today.setDate(today.getDate() - 7));
        return calculatePlanAdherence(days, oneWeekAgo);
    }

    function findLatestSaturdayMeasurementLog(beforeDate = null) {
        if (!appData.logs.measurements) return null;
        const allDates = Object.keys(appData.logs.measurements);
        if (allDates.length === 0) return null;

        const saturdayLogs = allDates
            .filter(dateStr => {
                const logDate = new Date(dateStr);
                return logDate.getDay() === 6; 
            })
            .sort((a, b) => new Date(b) - new Date(a));

        if (beforeDate) {
            const filteredSaturdays = saturdayLogs.filter(dateStr => new Date(dateStr) < beforeDate);
            if (filteredSaturdays.length > 0) {
                return appData.logs.measurements[filteredSaturdays[0]];
            }
        } else {
            if (saturdayLogs.length > 0) {
                return appData.logs.measurements[saturdayLogs[0]];
            }
        }
        return findLatestLog(appData.logs.measurements); 
    }


    function findLatestLog(logObject, beforeDate = null) {
        if (!logObject) return null;
        let dates = Object.keys(logObject);
        if (dates.length === 0) return null;
        if (beforeDate) dates = dates.filter(d => new Date(d) < beforeDate);
        if (dates.length === 0) return null;
        return logObject[dates.sort((a, b) => new Date(b) - new Date(a))[0]];
    }
    function parseExercises(str) {
        if (!str) return [];
        return str.split('\n').map(l => {
            const m = l.match(/(.+?)(?::\s*(\d+)\s*sets?,\s*(.+?)\s*reps.*)?$/i);
            return m && m[1] ? {
                name: m[1].trim(),
                sets: m[2] ? parseInt(m[2]) : 3,
                reps: m[3] ? m[3].trim() : '8-12'
            } : null;
        }).filter(Boolean);
    }
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = createEl('div', {
            className: `toast ${type}`,
            textContent: message
        });
        container.append(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    async function showConfirmation(message) {
        return new Promise(resolve => {
            const confirmBtn = createButton({
                id: 'modal-confirm-btn',
                content: 'Confirm',
                className: 'danger'
            });
            const cancelBtn = createButton({
                id: 'modal-cancel-btn',
                content: 'Cancel'
            });
            cancelBtn.onclick = () => {
                closeModal();
                resolve(false);
            };
            confirmBtn.onclick = () => {
                closeModal();
                resolve(true);
            };
            openModal("Please Confirm", [createEl('p', {
                textContent: message
            })], [cancelBtn, confirmBtn]);
        });
    }
    async function showPrompt(message, defaultValue = '') {
        return new Promise(resolve => {
            const inputId = 'modal-prompt-input';
            const input = createInput({
                type: 'text',
                id: inputId,
                value: defaultValue,
                style: 'width: 100%'
            });
            const saveBtn = createButton({
                id: 'modal-prompt-save-btn',
                content: 'Save'
            });
            saveBtn.onclick = () => {
                resolve(input.value.trim());
                closeModal(true);
            };
            openModal("Input Required", [createEl('p', {
                textContent: message
            }), createLabelForInput(inputId, 'Enter value:', 'sr-only'), input], [createButton({
                id: 'modal-prompt-cancel-btn',
                content: 'Cancel',
                onclick: () => closeModal(true)
            }), saveBtn], true);
            input.focus();
        });
    }
    function closeModal(isSubModal = false) {
        const modal = isSubModal ? document.querySelector('.sub-modal') : document.getElementById('app-modal'); 
        if (modal) {
            modal.style.display = 'none';
            if (isSubModal) {
                modal.remove();
            } else {
                document.getElementById('modal-body').innerHTML = ''; 
                document.getElementById('modal-footer').innerHTML = ''; 
                currentModalExercises = [];
            }
        }
    }
  function renderChecklistManager(container) {
    if (!container) return;
    container.innerHTML = '';
    (appData.dailyChecklist || []).forEach(item => {
        const deleteBtnId = `delete-checklist-item-${item.replace(/\s/g, '-')}`;
        container.append(createEl('div', {
            className: 'list-item'
        }, [
            createEl('span', {}, item),
            createButton({
                id: deleteBtnId,
                content: '<i class="fas fa-trash"></i>',
                className: 'danger',
                'data-action': 'delete-checklist-item',
                'data-item': item
            })
        ]));
    });
}
    function openModal(title, body, footer, isSubModal = false) {
        let modal, modalTitle, modalBody, modalFooter;
        if (isSubModal) {
            modal = createEl('div', {
                className: 'modal sub-modal'
            });
            const modalContent = createEl('div', {
                className: 'modal-content'
            });
            const closeBtn = createButton({
                className: 'close-button',
                innerHTML: '&times;'
            });
            closeBtn.onclick = () => closeModal(true);
            modalTitle = createEl('h2');
            modalBody = createEl('div', {
                className: 'modal-body'
            });
            modalFooter = createEl('div', {
                id: 'modal-footer',
                className: 'modal-footer'
            });
            modalContent.append(closeBtn, modalTitle, modalBody, modalFooter);
            modal.append(modalContent);
            document.body.append(modal);
        } else {
            modal = document.getElementById('app-modal'); 
            modalTitle = document.getElementById('modal-title'); 
            modalBody = document.getElementById('modal-body'); 
            modalFooter = document.getElementById('modal-footer'); 
        }
        modalTitle.innerHTML = title;
        modalBody.innerHTML = '';
        modalFooter.innerHTML = '';

        if (body) modalBody.append(...(Array.isArray(body) ? body : [body]));
        if (footer) modalFooter.append(...(Array.isArray(footer) ? footer : [footer]));

        modal.style.display = 'flex';
    }
    function toggleExerciseComplete(card) {
        if (card) {
            const completed = card.classList.toggle('completed');
            const tickButton = card.querySelector('.exercise-tick-btn');
            const exerciseName = card.dataset.exerciseName || 'exercise';
            if (tickButton) {
                tickButton.setAttribute('aria-pressed', String(completed));
                tickButton.setAttribute('aria-label', completed ? `Mark ${exerciseName} incomplete` : `Mark ${exerciseName} complete`);
            }
            updateSaveWorkoutButtonState();
        }
    }
    function toggleSnapshotExerciseDetails(itemElement) {
        if (itemElement) {
            const exerciseName = itemElement.dataset.exerciseName;
            if (expandedSnapshotExercise && expandedSnapshotExercise !== exerciseName) {
                const prevExpanded = document.querySelector(`.snapshot-exercise-item.expanded[data-exercise-name=\"${expandedSnapshotExercise}\"]`);
                if (prevExpanded) {
                    prevExpanded.classList.remove('expanded');
                    const prevDetails = prevExpanded.querySelector('.snapshot-details');
                    if (prevDetails) prevDetails.innerHTML = '';
                }
            }

            itemElement.classList.toggle('expanded');
            expandedSnapshotExercise = itemElement.classList.contains('expanded') ? exerciseName : null;

            const detailsElement = itemElement.querySelector('.snapshot-details');
            if (itemElement.classList.contains('expanded') && detailsElement) {
                detailsElement.innerHTML = ''; 
                const history = getExerciseHistory(exerciseName);
                if (history.length > 0) {
                    detailsElement.append(renderSnapshotHistory(exerciseName, history));
                } else {
                    detailsElement.append(createEl('p', {
                        textContent: 'No history for this exercise yet.',
                        style: 'text-align:center; color:var(--text-muted); padding: 10px 0;'
                    }));
                }
            } else if (detailsElement) {
                detailsElement.innerHTML = ''; 
            }
        }
    }
    function launchPRCelebration(exercise, value) {
        openModal("🎉 New Personal Record! 🎉", [
            createEl('p', {
                style: 'text-align: center; font-size: 1.2em;',
                innerHTML: `You've set a new 1-Rep Max PR for <strong>${exercise}</strong>!`
            }),
            createEl('p', {
                style: 'text-align: center; font-size: 2em; font-weight: 700;',
                className: 'kpi-value',
                textContent: `${value} ${appData.settings.weightUnit}`
            })
        ]);
    }
    function checkAndSavePR(exercise, reps, weight, date, options = {}) {
        const {
            silent = false
        } = options;
        const e1rm = calculateE1RM(weight, reps);
        if (e1rm === 0) return;

        const prKey = `${exercise}_1RM`;
        if (e1rm > (appData.personalRecords[prKey]?.value || 0)) {
            appData.personalRecords[prKey] = {
                value: e1rm.toFixed(1),
                date,
                reps,
                weight
            };
            if (!silent) {
                launchPRCelebration(exercise, e1rm.toFixed(1));
            }
        }
    }
    async function recalculatePRs() {
        if (await showConfirmation("This will delete all current PRs and rebuild them by scanning your entire workout history. This can't be undone. Continue?")) {
            const recalculateBtn = document.querySelector('[data-action=\"recalculate-prs\"]');
            recalculateBtn.classList.add('loading');
            showToast("Recalculating PRs...", "success");

            setTimeout(() => {
                appData.personalRecords = {};
                Object.values(appData.logs.workouts || {}).forEach(log => {
                    log.exercises.forEach(ex => {
                        ex.sets.forEach(set => {
                            checkAndSavePR(ex.name, set.reps, set.weight, log.date, {
                                silent: true
                            });
                        });
                    });
                });
                saveData();
                showToast("PRs recalculated successfully!", "success");
                recalculateBtn.classList.remove('loading');
                            }, 500);
        }
    }
    function getLogsInDateRange(logObject, days, endDate = new Date()) {
        const logsInRange = [];
        const today = new Date(endDate);
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;

            if (logObject[dateStr]) {
                logsInRange.push(logObject[dateStr]);
            }
        }
        return logsInRange.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    function calculateBFP() {
        const log = findLatestLog(appData.logs.measurements || {});
        if (!log || !appData.settings.height || !appData.settings.gender) return null;
        return calculateBFPForSpecificLog(log);
    }

    function calculateBFPForSpecificLog(log) {
        if (!log?.data || !appData.settings.height || !appData.settings.gender) return null;
        const {
            gender,
            height
        } = appData.settings;
        const {
            Waist,
            Neck,
            Hips
        } = log.data;
        if (!Waist || !Neck) return null;

        let bfp = 495;
        if (gender === 'male') {
            bfp = 495 / (1.0324 - 0.19077 * Math.log10(Waist - Neck) + 0.15456 * Math.log10(height)) - 450;
        } else if (gender === 'female') {
            if (!Hips) return null;
            bfp = 495 / (1.29579 - 0.35004 * Math.log10(Waist + Hips - Neck) + 0.22100 * Math.log10(height)) - 450;
        }
        return bfp > 0 ? bfp : null;
    }

    function getPastPerformance(exerciseName) {
        const history = getExerciseHistory(exerciseName);
        if (history.length === 0) return {
            html: '<p>No performance history yet.</p>',
            lastPerformance: null
        };

        const historySortedDesc = [...history].filter(log => log.sets && log.sets.length > 0).sort((a, b) => new Date(b.date) - new Date(a.date));
        const historySlice = historySortedDesc.slice(0, 3);

        let html = '';
        historySlice.forEach(log => {
            if (!log || !log.sets || log.sets.length === 0) return;
            const setsWithE1RM = log.sets.map(s => ({
                ...s,
                e1rm: calculateE1RM(s.weight, s.reps)
            }));
            const bestSetThisLog = setsWithE1RM.reduce((best, current) => (current.e1rm > best.e1rm ? current : best), {
                e1rm: 0
            });

            const setsSummary = log.sets.map(s => {
                const isBestSet = s.reps === bestSetThisLog.reps && s.weight === bestSetThisLog.weight;
                return `<span>${s.reps}x${s.weight}${appData.settings.weightUnit}</span>${isBestSet ? '<i class="fas fa-star best-set-star"></i>' : ''}`;
            }).join(', ');

            html += `<p><strong>${log.date}:</strong> ${setsSummary}</p>`;
        });

        const lastPerformanceWithSets = historySortedDesc.find(log => log.sets && log.sets.length > 0);
        return {
            html,
            lastPerformance: lastPerformanceWithSets
        };
    }
    // --- 7. UI RENDERING (Continued) ---
   
    // NEW: renderSupplements Function


    function renderNotes() {
        const container = document.getElementById('notes');
        if (container) container.innerHTML = ''; // FIX: Clear container to prevent card duplication
        
        const logDateObj = new Date(currentLogDate);
        const prevDate = new Date(logDateObj);
        prevDate.setDate(logDateObj.getDate() - 1);
        const nextDate = new Date(logDateObj);
        nextDate.setDate(logDateObj.getDate() + 1);

        const dailyNoteData = appData.logs.dailyNotes?.[currentLogDate] || {
            text: '',
            tags: []
        };
        const isSkipped = appData.logs.daily?.[currentLogDate]?.skipped;

        const dateSelector = createEl('div', {
            className: 'log-date-selector'
        }, [
            createButton({
                content: '<i class="fas fa-chevron-left"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(prevDate).date
            }),
            createEl('span', {
                className: 'date-display',
                textContent: getISTDateInfo(logDateObj).displayDate
            }),
            createButton({
                content: '<i class="fas fa-chevron-right"></i>',
                'data-action': 'set-log-date',
                'data-date': getISTDateInfo(nextDate).date
            }),
        ]);
        const noteInputId = 'daily-note-textarea';
        const noteInput = createEl('textarea', {
            id: noteInputId,
            rows: 8,
            placeholder: 'Write your daily note here (e.g., how your workout felt, diet notes, general thoughts)...',
            value: dailyNoteData.text,
            readOnly: !!dailyNoteData.text 
        });

        // Tag Selector
        const tagSelector = createEl('div', {
            className: 'tag-selector'
        },
            NOTE_TAGS.map(tag => {
                const tagCheckboxId = `tag-${tag.toLowerCase().replace(/\s/g, '-')}`;
                return createEl('div', {
                    className: 'tag-item'
                }, [
                    createInput({
                        type: 'checkbox',
                        id: tagCheckboxId,
                        className: 'note-tag-checkbox',
                        value: tag,
                        checked: dailyNoteData.tags.includes(tag),
                        'data-action': dailyNoteData.tags.includes(tag) ? 'remove-note-tag' : 'add-note-tag',
                        'data-tag': tag,
                        disabled: !!dailyNoteData.text 
                    }),
                    createEl('label', {
                        htmlFor: tagCheckboxId,
                        textContent: tag
                    })
                ]);
            })
        );


        const saveNoteBtn = createButton({
            id: 'save-daily-note-btn',
            content: 'Save Note',
            'data-action': 'save-daily-note',
            style: 'margin-top: 15px; width: 100%;',
            disabled: !!dailyNoteData.text 
        });

        const dailyNoteCard = createCard({
            header: `Daily Note for ${getISTDateInfo(new Date(currentLogDate)).displayDate}`
        }, [
            createLabelForInput(noteInputId, 'Daily Note:', 'sr-only'),
            noteInput,
            createEl('h4', {
                textContent: 'Tags',
                style: 'margin-top: 20px; margin-bottom: 10px;'
            }),
            tagSelector,
            saveNoteBtn
        ]);
        const omitCheckboxId = 'omit-from-streak';
        const skipGymSection = createCard({
            header: 'Manage Day Status',
            cardClass: 'skip-gym-section'
        }, [ 
            createEl('div', {
                className: 'checklist-item'
            }, [
                createInput({
                    type: 'checkbox',
                    id: omitCheckboxId,
                    checked: isSkipped?.omitFromStreak || false
                }),
                createEl('label', {
                    htmlFor: omitCheckboxId,
                    textContent: 'Omit this day from workout streak/adherence calculations?'
                })
            ]),
            createButton({
                id: 'log-skip-gym-notes-tab-btn',
                content: `<i class="fas fa-times-circle"></i> ${isSkipped ? 'Update Skipped Status' : 'Mark Day as Skipped'}`,
                className: 'danger',
                'data-action': 'log-skip-gym-notes-tab',
                style: 'margin-top: 15px; width: 100%;'
            })
        ]);

        return [dateSelector, dailyNoteCard, skipGymSection];
    }
 
    function renderSettings() {
        const container = document.getElementById('settings');
        if (container) container.innerHTML = ''; // FIX: Clear container to prevent card duplication
        
        const s = appData.settings;
        const genderSelectId = 'gender-select';
        const heightInputId = 'user-height-input';
        const progressionInputId = 'progression-input';
        const weightUnitSelectId = 'weight-unit-select';
        const distanceUnitSelectId = 'distance-unit-select';
        const themeSelectId = 'theme-select';
        const settingsCard = createCard({
            header: 'User Settings',
            id: 'settings-form'
        }, [
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(genderSelectId, 'Gender (for BFP%)'), createEl('select', {
                id: genderSelectId
            }, [createEl('option', {
                value: 'male',
                textContent: 'Male',
                selected: s.gender === 'male'
            }), createEl('option', {
                value: 'female',
                textContent: 'Female',
                selected: s.gender === 'female'
            }), ])]),
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(heightInputId, 'Height (cm)'), createInput({
                type: 'number',
                id: heightInputId,
                value: s.height
            })]),
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(progressionInputId, `Progression Increment (${s.weightUnit})`), createInput({
                type: 'number',
                id: progressionInputId,
                value: s.progression,
                step: 0.5
            })]),
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(weightUnitSelectId, 'Weight Units'), createEl('select', {
                id: weightUnitSelectId
            }, [createEl('option', {
                value: 'kg',
                textContent: 'Kilograms (kg)',
                selected: s.weightUnit === 'kg'
            }), createEl('option', {
                value: 'lbs',
                textContent: 'Pounds (lbs)',
                selected: s.weightUnit === 'lbs'
            }), ])]),
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(distanceUnitSelectId, 'Measurement Units'), createEl('select', {
                id: distanceUnitSelectId
            }, [createEl('option', {
                value: 'cm',
                textContent: 'Centimeters (cm)',
                selected: s.distanceUnit === 'cm'
            }), createEl('option', {
                value: 'in',
                textContent: 'Inches (in)',
                selected: s.distanceUnit === 'in'
            }), ])]),
            createEl('p', {
                textContent: 'Note: Changing units will affect future logs. Past logs will not be converted automatically.',
                style: 'font-size: 0.85em; color: var(--text-muted); margin-top: -5px; margin-bottom: 15px;'
            }),
            createEl('div', {
                className: 'setting-item'
            }, [createLabelForInput(themeSelectId, 'App Theme'), createEl('select', {
                id: themeSelectId
            }, [
                createEl('option', {
                    value: 'aurora-dark',
                    textContent: 'Aurora Dark',
                    selected: s.theme === 'aurora-dark'
                }),
                createEl('option', {
                    value: 'clean-light',
                    textContent: 'Clean Light',
                    selected: s.theme === 'clean-light'
                }),
                createEl('option', {
                    value: 'ocean-blue',
                    textContent: 'Ocean Blue',
                    selected: s.theme === 'ocean-blue'
                }),
                createEl('option', {
                    value: 'forest-green',
                    textContent: 'Forest Green',
                    selected: s.theme === 'forest-green'
                }),
            ])]),
            createButton({
                content: 'Save Settings',
                'data-action': 'save-settings',
                style: 'margin-top: 15px; width: 100%;'
            })
        ]);

        const dataManagementCard = createCard({
            header: 'Data Management'
        }, [
            createButton({
                content: '<i class="fas fa-upload"></i> Import from File',
                'data-action': 'import-from-file'
            }),
            createButton({
                content: '<i class="fas fa-download"></i> Export Data',
                'data-action': 'export-data'
            }),
            createButton({
                content: '<i class="fas fa-calculator"></i> Recalculate All PRs',
                'data-action': 'recalculate-prs',
                className: 'danger',
                style: 'margin-top: 10px; width: 100%;'
            }),
            createButton({
                content: '<i class="fas fa-power-off"></i> Reset App Data',
                'data-action': 'reset-app-data',
                className: 'danger',
                style: 'margin-top: 10px; width: 100%;'
            })
        ]);
        const importTextAreaId = 'import-text-area';
        const textImportCard = createCard({
            header: 'Import from Text'
        }, [
            createEl('p', {
                textContent: 'Paste your previously copied data into the box below and click import.',
                style: 'margin-bottom: 10px; color: var(--text-light);'
            }),
            createLabelForInput(importTextAreaId, 'Paste data here', 'sr-only'),
            createEl('textarea', {
                id: importTextAreaId,
                rows: 8,
                placeholder: 'Paste your GymTrack AI JSON data here...'
            }),
            createButton({
                content: 'Import from Text',
                'data-action': 'import-from-text',
                style: 'margin-top: 10px; width: 100%;'
            })
        ]);
        const exerciseDbSearchInputId = 'exercise-db-search-input';
        
        const exerciseDatabaseCard = createCard({
            header: 'Exercise Database'
        }, [
            createLabelForInput(exerciseDbSearchInputId, 'Search exercises', 'sr-only'),
            createInput({
                type: 'text',
                id: exerciseDbSearchInputId,
                placeholder: 'Search exercises in database...',
                style: 'margin-bottom: 10px;'
            }),
            renderExerciseDatabaseManager(),
            createButton({
                content: '<i class="fas fa-plus"></i> Add New Muscle Group',
                'data-action': 'add-new-muscle-group',
                style: 'margin-top: 15px; width: 100%;'
            })
        ]);

        return [settingsCard, dataManagementCard, textImportCard, exerciseDatabaseCard];
    }
    
    function renderExerciseDatabaseManager(searchTerm = '') {
        const container = createEl('div', {
            className: 'exercise-db-container'
        });
        const lowerSearchTerm = searchTerm.toLowerCase();

        getAllMuscleGroups().forEach(group => {
            const exercisesInGroup = (appData.exerciseDatabase || []).filter(ex =>
                ex.muscle === group && ex.name.toLowerCase().includes(lowerSearchTerm)
            );

            if (exercisesInGroup.length > 0 || !searchTerm) {
                const accordion = createEl('div', {
                    className: 'muscle-group-accordion'
                });
                const header = createEl('div', {
                    className: 'muscle-group-header',
                    'data-action': 'toggle-muscle-group'
                }, [
                    createEl('h4', {
                        textContent: group
                    }),
                    createEl('i', {
                        className: 'fas fa-chevron-right toggle-icon'
                    })
                ]);
                const content = createEl('div', {
                    className: 'muscle-group-content'
                });

                if (exercisesInGroup.length > 0) {
                    exercisesInGroup.forEach(ex => {
                        content.append(createEl('div', {
                            className: 'list-item'
                        }, [
                            createEl('span', {
                                textContent: ex.name
                            }),
                            createEl('div', {
                                style: 'display:flex; gap: 5px;'
                            }, [
                                createButton({
                                    content: '<i class="fas fa-exchange-alt"></i>',
                                    'data-action': 'move-exercise',
                                    'data-name': ex.name,
                                    'data-muscle': ex.muscle,
                                    title: 'Move Exercise'
                                }),
                                createButton({
                                    content: '<i class="fas fa-trash"></i>',
                                    className: 'danger',
                                    'data-action': 'delete-exercise-from-db',
                                    'data-name': ex.name,
                                    title: 'Delete Exercise'
                                })
                            ])
                        ]));
                    });
                } else {
                    content.append(createEl('p', {
                        textContent: 'No exercises in this group yet.',
                        style: 'color: var(--text-muted); text-align: center;'
                    }));
                }

                content.append(createButton({
                    content: 'Add Exercise to this Group',
                    className: 'add-exercise-to-group-btn',
                    'data-action': 'add-exercise-to-group',
                    'data-group': group
                }));
                accordion.append(header, content);
                container.append(accordion);
            }
        });
        return container;
    }

    async function addNewMuscleGroup(fromModal = false) {
        const newGroup = await showPrompt('Enter new muscle group name:');
        if (!newGroup) return;
        if (getAllMuscleGroups().map(g => g.toLowerCase()).includes(newGroup.toLowerCase())) {
            return showToast(`Muscle group "${newGroup}" already exists.`, 'error');
        }
        appData.customMuscleGroups.push(newGroup);
        saveData();
        render('settings');
        showToast(`Muscle group "${newGroup}" added!`, 'success');
    }

    async function addExerciseToGroup(group) {
        const exerciseName = await showPrompt(`Enter name for new exercise in "${group}":`);
        if (!exerciseName) return;
        if ((appData.exerciseDatabase || []).some(ex => ex.name.toLowerCase() === exerciseName.toLowerCase())) {
            return showToast(`Exercise "${exerciseName}" already exists.`, 'error');
        }
        addNewExerciseToDatabase(exerciseName, group);
        render('settings');
        showToast(`Added "${exerciseName}" to ${group}.`, 'success');
    }

    async function showMoveExerciseModal(exerciseName, currentMuscle) {
        const allGroups = getAllMuscleGroups().filter(g => g !== currentMuscle);
        const moveSelectId = 'move-exercise-select';
        const selectEl = createEl('select', {
            id: moveSelectId
        });
        allGroups.forEach(group => selectEl.append(createEl('option', {
            value: group,
            textContent: group
        })));

        const saveBtn = createButton({
            content: 'Move Exercise'
        });
        saveBtn.onclick = () => {
            const newMuscle = getEl(moveSelectId).value;
            const exercise = (appData.exerciseDatabase || []).find(ex => ex.name === exerciseName);
            if (exercise) {
                exercise.muscle = newMuscle;
                saveData();
                render('settings');
                showToast(`Moved "${exerciseName}" to ${newMuscle}.`, 'success');
                closeModal();
            } else {
                showToast('Error: Could not find exercise to move.', 'error');
            }
        };
        openModal(`Move "${exerciseName}"`, [
            createEl('p', {
                textContent: `Current group: ${currentMuscle}`
            }),
            createLabelForInput(moveSelectId, 'Select new muscle group:'),
            selectEl
        ], [createButton({
            content: 'Cancel',
            'data-action': 'close-modal'
        }), saveBtn]);
    }

    async function deleteExerciseFromDatabase(exerciseName) {
        if (await showConfirmation(`Are you sure you want to delete "${exerciseName}" from your database? This will NOT delete past logged workouts.`)) {
            appData.exerciseDatabase = (appData.exerciseDatabase || []).filter(ex => ex.name !== exerciseName);
            saveData();
            render('settings');
            showToast(`Exercise "${exerciseName}" deleted from database.`, 'info');
        }
    }

    async function processImportedData(dataString) {
        try {
            const importedData = JSON.parse(dataString);
            if (importedData.settings && importedData.logs) {
                if (await showConfirmation("Importing data will overwrite ALL current data. Continue?")) {
                    appData = deepMerge(createDefaultData(), importedData);
                    saveData();
                    showToast("Data imported successfully. Reloading...", "success");
                    setTimeout(() => {
                        if (typeof location.reload === 'function') location.reload();
                        else init();
                    }, 1500);
                }
            } else {
                showToast("Invalid data file. Missing 'settings' or 'logs' properties.", "error");
            }
        } catch (err) {
            console.error("Failed to parse imported data:", err);
            showToast("Failed to parse data. Ensure it's valid JSON.", "error");
        }
    }
    function importDataFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processImportedData(e.target.result);
        reader.readAsText(file);
        event.target.value = '';
    }
    function importDataFromText() {
        const dataString = getEl('import-text-area').value.trim();
        if (dataString) processImportedData(dataString);
        else showToast("Textbox is empty.", "error");
    }
    function exportData() {
        const dataStr = JSON.stringify(appData, null, 2);

        const copyToClipboard = () => {
            const textArea = document.createElement('textarea');
            textArea.value = dataStr;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast("Data copied to clipboard!", "success");
            } catch (err) {
                console.error('Failed to copy text: ', err);
                showToast("Failed to copy data. Please copy manually.", "error");
            }
            document.body.removeChild(textArea);
            closeModal();
        };

        const downloadFile = () => {
            try {
                const blob = new Blob([dataStr], {
                    type: "application/json"
                });
                const url = URL.createObjectURL(blob);
                const downloadButton = createEl('a', {
                    href: url,
                    download: `GymTrackAI_Backup_${getISTDateInfo().date}.json`,
                    textContent: 'Download Backup File',
                });
                downloadButton.style.cssText = 'display: block; text-align: center; margin-top: 15px; background: var(--grad-green); color: white; text-decoration: none; padding: 12px; border-radius: var(--border-radius-sm);';

                const explanation = createEl('p', {
                    textContent: 'Tap the button below to download your data backup file.',
                    style: 'text-align: center;'
                });
                openModal('Download Data', [explanation, downloadButton], [createButton({
                    content: 'Back',
                    onclick: exportData
                }), createButton({
                    content: 'Close',
                    'data-action': 'close-modal'
                })]);

                downloadButton.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(url), 500));
            } catch (error) {
                showToast("Failed to create download link.", "error");
                console.error("Download link error:", error);
            }
        };

        openModal(
            'Export Your Data',
            [
                createEl('p', {
                    textContent: 'Choose how you want to export your data:'
                }),
                createButton({
                    content: 'Copy to Clipboard',
                    onclick: copyToClipboard,
                    style: 'width: 100%; margin-bottom: 10px;'
                }),
                createButton({
                    content: 'Download File',
                    onclick: downloadFile,
                    style: 'width: 100%;'
                })
            ],
            [createButton({
                content: 'Cancel',
                'data-action': 'close-modal'
            })]
        );
    }
    function addNewExerciseToDatabase(exerciseName, muscleGroup = null) {
        if (!exerciseName) return;
        exerciseName = exerciseName.trim();
        const db = appData.exerciseDatabase || [];
        const existingEx = db.find(ex => ex.name.toLowerCase() === exerciseName.toLowerCase());
        if (!existingEx) {
            db.push({
                name: exerciseName,
                muscle: muscleGroup || guessMuscleGroup(exerciseName)
            });
            appData.exerciseDatabase = db;
            saveData();
        } else if (muscleGroup && existingEx.muscle !== muscleGroup) {
            existingEx.muscle = muscleGroup;
            saveData();
        }
    }
    function addExerciseToLog(exerciseName) {
        if (!exerciseName) return;
        if (!currentSessionExercises) {
            const {
                day
            } = getISTDateInfo(new Date(currentLogDate));
            const activePlan = appData.weeklyPlans[appData.settings.activeWeeklyPlan];
            const planForDay = activePlan?.plan?.[day] || {
                exercises: []
            };
            currentSessionExercises = JSON.parse(JSON.stringify(planForDay.exercises)).map((ex, index) => ({
                ...ex,
                log_id: `log_ex_${index}_${Date.now()}`
            }));
        }
        if (currentSessionExercises.some(ex => ex.name === exerciseName)) {
            return showToast(`${exerciseName} is already in the current log.`, 'error');
        }
        currentSessionExercises.push({
            name: exerciseName,
            sets: 3,
            reps: '', // FIX: Added default empty string for reps
            log_id: `log_ex_new_${Date.now()}`
        });
        render('log');
        if (document.getElementById('snapshot').classList.contains('active')) render('snapshot');
        render('dashboard'); 
        updateSaveWorkoutButtonState();
    }
    function addSetToExercise(card) {
        if (card) {
            const container = card.querySelector('.sets-container');
            if (container) {
                const logId = card.dataset.logId;
                container.append(createSetEntry(container.children.length + 1, '', '', logId));
                updateSaveWorkoutButtonState();
            }
        }
    }
    function calculateE1RM(weight, reps) {
        if (!weight || reps < 1) return 0;
        if (reps === 1) return parseFloat(weight);
        return parseFloat(weight) * (1 + parseFloat(reps) / 30);
    }
    function showExerciseSelectionModal() {
        const sortedDb = [...new Set((appData.exerciseDatabase || []).map(e => e.name))].sort();
        const searchInputId = 'log-exercise-search';
        const searchInput = createInput({
            type: 'text',
            id: searchInputId,
            placeholder: 'Search or add new exercise...'
        });
        const searchLabel = createLabelForInput(searchInputId, 'Search for an exercise to log', 'sr-only');
        const listContainer = createEl('div', {
            style: 'max-height: 300px; overflow-y: auto; margin-top: 10px;'
        });

        const renderList = (filter = '') => {
            listContainer.innerHTML = '';
            const lowerFilter = filter.toLowerCase();
            const filteredDb = sortedDb.filter(name => name.toLowerCase().includes(lowerFilter));

            if (filter && !filteredDb.some(name => name.toLowerCase() === lowerFilter)) {
                listContainer.prepend(createEl('div', {
                    className: 'list-item list-item-new',
                    innerHTML: `<i class="fas fa-plus"></i> Add "${filter}"`,
                    style: 'cursor:pointer;',
                    'data-action': 'add-exercise-to-log-from-modal',
                    'data-name': filter
                }));
            }

            filteredDb.forEach(name => listContainer.append(createEl('div', {
                className: 'list-item',
                'data-action': 'add-exercise-to-log-from-modal',
                'data-name': name,
                textContent: name,
                style: 'cursor:pointer;'
            })));
        };

        searchInput.oninput = () => renderList(searchInput.value.trim());
        openModal('Select Exercise', [searchLabel, searchInput, listContainer]);
        renderList();
    }
    
    function destroyAllCharts() {
        Object.values(charts).forEach(chart => chart?.destroy());
        charts = {};
    }

    function createChart(canvasId, type, chartData) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) {
            console.warn(`Canvas element with ID '${canvasId}' not found for chart creation.`);
            return;
        }

        if (chartData?.data?.datasets && chartData.data.datasets.length === 0 && !['doughnut', 'pie'].includes(type)) {
            ctx.canvas.parentNode.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Not enough data for this chart.</p>`;
            return;
        }

        if (charts[canvasId]) charts[canvasId].destroy();
        const currentTheme = appData.settings.theme; 
        const themeColors = CHART_COLORS[currentTheme] || CHART_COLORS['aurora-dark']; 
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary');
        const gridColor = getComputedStyle(document.body).getPropertyValue('--border-color');

        if (chartData.data.datasets) {
            chartData.data.datasets.forEach((dataset, index) => {
                const datasetColor = themeColors[index % themeColors.length]; 
                
                dataset.borderColor = dataset.borderColor || datasetColor; 

                if (type === 'line') {
                    const gradientColor = dataset.borderColor.startsWith('#') ? dataset.borderColor : datasetColor; 
                    
                    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                    gradient.addColorStop(0, `${gradientColor}90`); 
                    gradient.addColorStop(1, `${gradientColor}00`);
                    
                    dataset.backgroundColor = gradient;
                    dataset.fill = dataset.fill !== false;
                    dataset.tension = dataset.tension ?? 0.4;
                    dataset.pointBackgroundColor = dataset.pointBackgroundColor || dataset.borderColor;
                } else if (type === 'radar') {
                    dataset.backgroundColor = `${dataset.borderColor}40`;
                    dataset.pointBackgroundColor = dataset.borderColor;
                } else if (type === 'pie' || type === 'doughnut') {
                    dataset.backgroundColor = dataset.backgroundColor || themeColors;
                    dataset.borderColor = getComputedStyle(document.body).getPropertyValue('--bg-color');
                    dataset.borderWidth = 2;
                } else {
                    dataset.backgroundColor = dataset.backgroundColor || themeColors[index % themeColors.length];
                }
            });
        }

        let defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleColor: '#fff',
                    bodyColor: '#fff'
                },
                annotation: {
                    annotations: []
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 1200,
                easing: 'easeInOutQuart'
            }
        };

        if (type === 'radar') {
            defaultOptions.scales = {
                r: {
                    angleLines: {
                        color: gridColor
                    },
                    grid: {
                        color: gridColor
                    },
                    pointLabels: {
                        color: textColor,
                        font: {
                            size: 13
                        }
                    },
                    ticks: {
                        color: textColor,
                        backdropColor: 'rgba(0,0,0,0.5)',
                        backdropPadding: 2
                    }
                }
            };
        } else if (type !== 'pie' && type !== 'doughnut') {
            defaultOptions.scales = {
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    },
                    title: {
                        display: !!chartData.options?.scales?.y?.title?.text,
                        text: chartData.options?.scales?.y?.title?.text || ''
                    }
                },
                x: {
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    },
                    type: chartData.options?.scales?.x?.type || 'category',
                    ...(chartData.options?.scales?.x?.type === 'time' ? {
                        time: {
                            unit: 'day',
                            tooltipFormat: 'MMM dd'
                        }
                    } : {})
                }
            };
        }
        charts[canvasId] = new Chart(ctx, {
            type,
            data: chartData.data,
            options: deepMerge(defaultOptions, chartData.options || {})
        });
    }

    function updateExerciseAnalysis(selections) {
        const container = getEl('exercise-analysis-container');
        const statsContainer = getEl('exercise-stats-container');
        let detailedAnalysisContainer = getEl('detailed-analysis-container');

        if (detailedAnalysisContainer) detailedAnalysisContainer.remove();
        destroyAllCharts();
        statsContainer.innerHTML = '';

        if (!selections || selections.length === 0) return;

        if (selections.length === 1 && !selections[0].startsWith('group_')) {
            const exerciseName = selections[0];
            const history = getExerciseHistory(exerciseName);
            if (history.length === 0) {
                statsContainer.innerHTML = `<div class=\"card-empty-state\"><p>No logged data for ${exerciseName} yet.</p></div>`;
                return;
            }

            const firstWorkout = history[history.length - 1]?.date;
            const timesPerformed = history.length;
            const frequency = calculateFrequencyMetrics(history);
            const bestSet = getTopSets(history, 1)[0];
            const bestSetE1RM = bestSet ? bestSet.e1rm.toFixed(1) : 'N/A';
            const maxWeight = getMaxWeight(history);
            const totalVolume = getTotalLifetimeVolume(history);

            statsContainer.innerHTML = `<div class=\"progress-kpi-grid\">
                ${createKPI('Sessions', timesPerformed).outerHTML}
                ${createKPI('Best e1RM', bestSetE1RM, appData.settings.weightUnit).outerHTML}
                ${createKPI('Max Weight', maxWeight, appData.settings.weightUnit).outerHTML}
                ${createKPI('Total Volume', totalVolume.toLocaleString(), appData.settings.weightUnit).outerHTML}
                ${createKPI('First Log', firstWorkout).outerHTML}
                ${createKPI('Frequency', frequency.avgDays, `~ every ${frequency.avgDays} days`).outerHTML}
            </div>`;

            detailedAnalysisContainer = createEl('div', {
                id: 'detailed-analysis-container',
                className: 'progress-analysis-grid'
            });
            container.append(detailedAnalysisContainer);

            const topSetsForExercise = getTopSets(history, 5);
            const topSetsHtml = topSetsForExercise.length > 0 ?
                `<div class=\"top-prs-list\">
                    <h4>Top Personal Bests (e1RM)</h4>
                    <ul>
                        ${topSetsForExercise.map(s => `<li>${s.reps}r @ ${s.weight}${appData.settings.weightUnit} (e1RM: ${s.e1rm.toFixed(1)}) - ${s.date}</li>`).join('')}
                    </ul>
                </div>` :
                `<p style=\"text-align:center; color:var(--text-muted);\">No personal bests recorded for this exercise.</p>`;
            detailedAnalysisContainer.append(createCard({
                header: "Top PRs"
            }, [createEl('div', {
                innerHTML: topSetsHtml
            })]));


            const trendData = getExerciseTrendData(exerciseName);
            detailedAnalysisContainer.append(createCard({
                header: "Volume vs. Intensity Trend"
            }, [createEl('div', {
                className: 'chart-container tall-chart'
            }, [createEl('canvas', {
                id: 'exercise-trend-chart'
            })])]));
            setTimeout(() => {
                const prsForExercise = Object.entries(appData.personalRecords || {})
                    .filter(([key, record]) => key.startsWith(exerciseName))
                    .map(([key, record]) => record);

                createChart('exercise-trend-chart', 'line', {
                    data: trendData.data,
                    options: deepMerge(trendData.options, {
                        plugins: {
                            annotation: {
                                annotations: prsForExercise.map(pr => ({
                                    type: 'point',
                                    xValue: pr.date,
                                    yValue: pr.value,
                                    radius: 5,
                                    backgroundColor: 'var(--glow-pr)',
                                    borderColor: '#fff',
                                    borderWidth: 1,
                                    pointStyle: 'star',
                                    label: {
                                        content: `PR: ${pr.value}`,
                                        display: true,
                                        position: 'top',
                                        backgroundColor: 'rgba(0,0,0,0.7)',
                                        color: 'var(--glow-pr)',
                 
                       font: {
                                            size: 10,
                                            weight: 'bold'
                                        }
                                    }
                                }))
                            }
                        }
                    })
                });
            }, 0);

            const repRangeData = getRepRangeDistribution(history);
            detailedAnalysisContainer.append(createCard({
                header: "Rep Range Distribution"
            }, [createEl('div', {
                className: 'chart-container'
            }, [createEl('canvas', {
                id: 'rep-range-chart'
            })])]));
            setTimeout(() => createChart('rep-range-chart', 'doughnut', repRangeData), 0);

            const setDropOffData = getSetBySetDropOff(history);
            detailedAnalysisContainer.append(createCard({
                header: "Avg. Reps per Set"
            }, [createEl('div', {
                className: 'chart-container'
            }, [createEl('canvas', {
                id: 'set-dropoff-chart'
            })])]));
            setTimeout(() => createChart('set-dropoff-chart', 'bar', setDropOffData), 0);

            const allPastLogsCard = createCard({
                header: "All Past Logs"
            }, [renderAllPastLogsTable(history)]);
            detailedAnalysisContainer.append(allPastLogsCard);

        } else {
            const chartContainer = createEl('div', {
                className: 'chart-container tall-chart'
            }, [createEl('canvas', {
                id: 'exercise-trend-chart'
            })]);
            container.append(chartContainer);
            const datasets = [];
            selections.forEach(selection => {
                if (selection.startsWith('group_')) {
                    const muscleGroup = selection.replace('group_', '');
                    const trendData = getMuscleGroupTrendData(muscleGroup);
                    if (trendData) datasets.push(trendData);
                } else {
                    const exerciseTrendData = getExerciseTrendData(selection);
                    datasets.push(...exerciseTrendData.data.datasets);
                }
            });
            const finalDatasets = datasets.reduce((acc, current) => {
                if (!acc.find(item => item.label === current.label)) acc.push(current);
                return acc;
            }, []);

            const chartData = {
                data: {
                    labels: [],
                    datasets: finalDatasets
                },
                options: {
                    scales: {
                        y: {
                            position: 'left',
                            title: {
                                display: true,
                                text: `Volume (${appData.settings.weightUnit})`
                            }
                        },
                        y1: {
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            title: {
                                display: true,
                                text: `e1RM / Intensity`
                            }
                        }
                    }
                }
            };
            createChart('exercise-trend-chart', 'line', chartData);
        }
    }

    function renderAllPastLogsTable(history) {
        if (history.length === 0) {
            return createEl('p', {
                textContent: 'No logged data for this exercise.',
                style: 'text-align:center; color: var(--text-muted);'
            });
        }

        const maxSets = history.reduce((max, log) => Math.max(max, log.sets.length), 0);
        if (maxSets === 0) {
            return createEl('p', {
                textContent: 'No valid set data found for this exercise.',
                style: 'text-align:center; color: var(--text-muted);'
            });
        }

        const table = createEl('table', {
            className: 'snapshot-history-table'
        });
        const thead = createEl('thead');
        const headerRow = createEl('tr');
        headerRow.append(createEl('th', {
            textContent: 'Date'
        }));
        for (let i = 1; i <= maxSets; i++) {
            headerRow.append(createEl('th', {
                textContent: `Set ${i}`
            }));
        }
        headerRow.append(createEl('th', { textContent: 'e1RM' })); // Added e1RM column
        thead.append(headerRow);
        table.append(thead);

        const tbody = createEl('tbody');
        history.forEach(log => {
            let maxE1RM = 0;
            log.sets.forEach(set => {
                maxE1RM = Math.max(maxE1RM, calculateE1RM(set.weight, set.reps));
            });

            const row = createEl('tr');
            row.append(createEl('td', {
                textContent: log.date
            }));
            for (let i = 0; i < maxSets; i++) {
                const set = log.sets[i];
                const cellContent = set ? `${set.reps}x${set.weight}${appData.settings.weightUnit}` : '-';
                row.append(createEl('td', {
                    textContent: cellContent
                }));
            }
            row.append(createEl('td', { textContent: maxE1RM.toFixed(1) }));
            tbody.append(row);
        });
        table.append(tbody);
        return table;
    }
    // NEW: Render Abs Checklist
    function renderAbsChecklist(checkedItems = []) {
        const container = createEl('div', { id: 'abs-checklist-container' });
        (appData.absMuscleGroups || []).forEach(item => {
            const checkboxId = `abs-check-${item.replace(/\s+/g, '-')}`;
            container.append(createEl('div', { className: 'checklist-item' }, [
                createInput({
                    type: 'checkbox',
                    id: checkboxId,
                    checked: checkedItems.includes(item),
                    'data-item': item,
                    'data-action': 'toggle-abs-completion'
                }),
                createEl('label', { htmlFor: checkboxId, textContent: item })
            ]));
        });
        return container;
    }
    
    // NEW: Render Abs Muscle Group Manager
    function renderAbsMuscleGroupManager() {
        const container = createEl('div', { id: 'manage-abs-muscle-groups' });
        (appData.absMuscleGroups || []).forEach(item => {
            const deleteBtnId = `delete-abs-muscle-group-${item.replace(/\s/g, '-')}`;
            container.append(createEl('div', { className: 'list-item' }, [
                createEl('span', {}, item),
                createButton({
                    id: deleteBtnId,
                    content: '<i class="fas fa-trash"></i>',
                    className: 'danger',
                    'data-action': 'delete-abs-muscle-group',
                    'data-group': item
                })
            ]));
        });
        return container;
    }
    
    // NEW: Get planned abs groups for a given day
    function getPlannedAbsGroups(dayName) {
        return appData.weeklyPlans?.[appData.settings.activeWeeklyPlan]?.abs?.[dayName] || [];
    }

    // NEW: Calculate total daily completion for the dashboard
    function calculateTotalDailyCompletion() {
        const { date } = getISTDateInfo();

        const habitCompletion = calculateDailyHabitCompletion(date);
        const suppCompletion = calculateDailySupplementCompletion(date);
        const absCompletion = calculateDailyAbsCompletion(date);
        const waterCompletion = calculateDailyWaterCompletion(date); // NEW: Water completion

        const checklistItems = (appData.dailyChecklist?.length || 0) > 0 ? 1 : 0;
        const suppItems = (appData.supplementLibrary?.length || 0) > 0 ? 1 : 0;
        const absItems = (appData.absMuscleGroups?.length || 0) > 0 ? 1 : 0;
        const waterItems = appData.settings.waterGoal > 0 ? 1 : 0; // NEW: Water is a factor if goal is set
        
        let totalCategories = 0;
        let completedCategories = 0;

        if (checklistItems > 0) {
            totalCategories++;
            if (habitCompletion.completedCount > 0) completedCategories++;
        }
        if (suppItems > 0) {
            totalCategories++;
            if (calculateDailySupplementAdherenceBinary(date)) completedCategories++; 
        }
        if (absItems > 0) {
            totalCategories++;
            if (calculateDailyAbsAdherenceBinary(date)) completedCategories++; 
        }
        if (waterItems > 0) { // NEW: Include water
            totalCategories++;
            if (waterCompletion.percentage >= 100) completedCategories++;
        }

        return totalCategories > 0 ? (completedCategories / totalCategories) * 100 : 0;
    }
    
    // NEW: Helper for binary Abs completion (used by Dashboard overall KPI)
    function calculateDailyAbsAdherenceBinary(dateStr) {
        const absLog = appData.logs.abs?.[dateStr];
        return (absLog?.absMuscles?.length || 0) > 0;
    }

    // NEW: Helper for binary Supplement completion (used by Dashboard overall KPI)
    function calculateDailySupplementAdherenceBinary(dateStr) {
        const dailyLog = appData.logs.daily?.[dateStr];
        return (dailyLog?.supplements?.length || 0) > 0;
    }

    // NEW: Calculate abs checklist completion (for subtitle/internal use)
    function calculateDailyAbsCompletion(dateStr) {
        const todayAbsLog = appData.logs.abs?.[dateStr] || { absMuscles: [] };
        const completedCount = todayAbsLog.absMuscles?.length || 0;
        const totalCount = appData.absMuscleGroups?.length || 0; 
        const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        return { completedCount, totalCount, percentage };
    }
    
    // NEW: Calculate Water Completion (Intake feature)
    function calculateDailyWaterCompletion(dateStr) {
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0
        const currentIntake = appData.logs.waterLog?.[dateStr]?.intake || 0;
        const percentage = (currentIntake / goal) * 100;
        
        return { currentIntake, goal, percentage };
    }
    
    // NEW: Water Trend Graph (for Habits Tab)
    function getWaterTrendData(days) {
        const labels = [];
        const data = [];
        const goalLine = [];
        const today = new Date();
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            labels.push(dateStr);
            
            const intake = appData.logs.waterLog?.[dateStr]?.intake || 0;
            data.push(intake > 0 ? intake : null);
            goalLine.push(goal);
        }
        
        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Intake (L)',
                    data: data,
                    borderColor: '#3b82f6', // <-- UPDATED
                    backgroundColor: 'rgba(59, 130, 246, 0.4)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6' // <-- UPDATED
                },
                {
                    label: 'Goal',
                    data: goalLine,
                    borderColor: 'rgba(250, 204, 21, 0.8)',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    tension: 0,
                    fill: false
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Liters' }
                    }
                }
            }
        };
    }
    // NEW: Calculate Water Consistency (for heatmap integration)
    function calculateWaterConsistency(days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            
            if (goal > 0) { // Only track if a goal is set
                totalConsideredDays++;
                const intake = appData.logs.waterLog?.[dateStr]?.intake || 0;
                if (intake >= goal) {
                    completedDays++;
                }
            }
        }
        
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }

    // FIX: Calculate Abs Distribution Data (Doughnut Chart) - Initialized absCounts (Error 1)
    function getAbsDistributionData(days) {
        const absCounts = {}; // FIX: Initialized absCounts
        let totalActivity = 0;
        const logs = getLogsInDateRange(appData.logs.abs || {}, days);

        logs.forEach(log => {
            (log.absMuscles || []).forEach(muscle => {
                absCounts[muscle] = (absCounts[muscle] || 0) + 1;
                totalActivity++;
            });
        });

        const labels = Object.keys(absCounts);
        const data = Object.values(absCounts);
        
        return {
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: CHART_COLORS[appData.settings.theme],
                    hoverOffset: 4
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-primary'),
                        }
                    },
                    title: {
                        display: totalActivity === 0,
                        text: 'No Abs Data Logged',
                        color: getComputedStyle(document.body).getPropertyValue('--text-muted')
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
            }
        };
    }
    
    // NEW: Calculate Abs Consistency (for heatmap integration)
    function calculateAbsConsistency(absGroup, days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const isOverall = absGroup === 'Overall';

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            
            totalConsideredDays++;
            const absLog = appData.logs.abs?.[dateStr];
            
            if (isOverall) {
                if (absLog?.absMuscles?.length > 0) {
                    completedDays++;
                }
            } else if (absLog?.absMuscles?.includes(absGroup)) {
                completedDays++;
            }
        }
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }
    
    // NEW: Calculate Plank consistency
    function calculatePlankConsistency(days = 30) {
        const plankLogs = getLogsInDateRange(appData.logs.planks || {}, days);
        const completedDays = plankLogs.filter(log => log.length > 0).length;
        return {
            score: days > 0 ? (completedDays / days) * 100 : 0,
            totalDays: days,
            completedDays: completedDays
        };
    }
    
    // NEW: Get Plank Trend Data
    function getPlankTrendData(days) {
        const labels = [];
        const data = [];
        const today = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            labels.push(dateStr);
            
            const plankLogsForDay = appData.logs.planks?.[dateStr] || [];
            const longestPlank = plankLogsForDay.reduce((max, log) => Math.max(max, log.time), 0);
            data.push(longestPlank > 0 ? longestPlank : null);
        }
        
        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Longest Plank (s)',
                    data: data,
                    borderColor: 'var(--glow-secondary)',
                    backgroundColor: 'rgba(59, 130, 246, 0.4)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: 'var(--glow-secondary)'
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Time (seconds)' }
                    }
                }
            }
        };
    }

    function seedExerciseDatabase() {
        const defaultExercises = [
            { name: "Wide Lat Pulldown - MAG Grip", muscle: "Back" },
            { name: "Cable Rows Wide - MAG Grip", muscle: "Back" },
            { name: "Straight Bar Pulldown", muscle: "Back" },
            { name: "Chest Seated Row Machine", muscle: "Back" },
            { name: "T-Bar Rows", muscle: "Back" },
            { name: "DB Curl", muscle: "Biceps" },
            { name: "Unilateral Bicep Curl (Cable)", muscle: "Biceps" },
            { name: "DB Hammer Curl", muscle: "Biceps" },
            { name: "Preacher Curl", muscle: "Biceps" },
            { name: "Cable Rear Delt Fly", muscle: "Delts" },
            { name: "Reverse Pec Deck", muscle: "Delts" },
            { name: "Straight-Arm Rope Pulldown", muscle: "Back" },
            { name: "Leg Press", muscle: "Legs" },
            { name: "DB Sumo Squat", muscle: "Legs" },
            { name: "Smith Squat", muscle: "Legs" },
            { name: "DB Lunges", muscle: "Legs" },
            { name: "Laying Leg Curl", muscle: "Legs" },
            { name: "Standing Calf Raise", muscle: "Legs" },
            { name: "Seated Calf Raise", muscle: "Legs" },
            { name: "Bar Pushdown", muscle: "Triceps" },
            { name: "Incline Skull Crusher", muscle: "Triceps" },
            { name: "Cable Overhead Triceps Extension", muscle: "Triceps" },
            { name: "Leg Extension", muscle: "Legs" },
            { name: "3 types Cable triceps", muscle: "Triceps" },
            { name: "Barbell Flat Bench Press", muscle: "Chest" },
            { name: "Barbell Incline Press", muscle: "Chest" },
            { name: "Incline DB Hammer Press", muscle: "Chest" },
            { name: "Decline Cable Crossover", muscle: "Chest" },
            { name: "DB Shoulder Press", muscle: "Shoulders" },
            { name: "DB Side Raise", muscle: "Shoulders" },
            { name: "Front Delt DB Raise", muscle: "Delts" },
            { name: "Arnold Press", muscle: "Shoulders" },
            { name: "DB Shrugs", muscle: "Traps" },
            { name: "Rope Upright Rows", muscle: "Shoulders" },
            { name: "Flat Cable Fly", muscle: "Chest" },
            { name: "3 Types Shoulder", muscle: "Shoulders" },
            { name: "Cable Rows (Wide - Reverse)", muscle: "Back" },
            { name: "Lat Pulldown", muscle: "Back" },
            { name: "Cable Curl", muscle: "Biceps" },
            { name: "DB Concentration Curl", muscle: "Biceps" },
            { name: "Cable Rope Face Pull", muscle: "Delts" },
            { name: "Cable Rows - MAG Narrow", muscle: "Back" },
            { name: "Barbell Shrugs (Reverse Grip)", muscle: "Traps" },
            { name: "Side Cable Raise", muscle: "Shoulders" },
            { name: "DB Flat Press", muscle: "Chest" },
            { name: "Incline DB Press", muscle: "Chest" },
            { name: "Dumbbell Lateral Raise", muscle: "Shoulders" }
        ];

        defaultExercises.forEach(ex => {
            const existing = appData.exerciseDatabase.find(dbEx => dbEx.name.toLowerCase() === ex.name.toLowerCase());
            if (!existing) {
                appData.exerciseDatabase.push(ex);
            } else if (existing.muscle === 'Other' && ex.muscle !== 'Other') {
                existing.muscle = ex.muscle;
            }
        });
        saveData();
    }

    function getAllMuscleGroups() {
        const defaultGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Traps', 'Delts', 'Forearms', 'Cardio', 'Other', 'Rest'];
        const all = new Set([...defaultGroups, ...(appData.customMuscleGroups || [])]);
        return [...all].sort((a, b) => {
            if (a === 'Other' || a === 'Rest') return 1;
            if (b === 'Other' || b === 'Rest') return -1;
            return a.localeCompare(b);
        });
    }

    function guessMuscleGroup(name) {
        if (typeof name !== 'string') return 'Other';
        name = name.toLowerCase();
        if (/(leg press|lunge|squat|calf|leg extension|leg curl|glute|hamstring|quad|smith squat|adductor|abductor)/.test(name)) return 'Legs';
        if (/(bench|press|fly|push-up|pec|crossover|pushup|db flat press)/.test(name) && !/(shoulder|overhead|incline db hammer)/.test(name)) return 'Chest';
        if (/(row|pull-down|pull-up|chin-up|pulldown|deadlift|lat machine|straight-arm rope pulldown)/.test(name)) return 'Back';
        if (/(shoulder press|lateral raise|front raise|arnold|upright row|side raise machine|cable front raise|dumbbell lateral raise)/.test(name)) return 'Shoulders';
        if (/(bicep curl|preacher curl|concentration curl|hammer curl|unilateral bicep curl)/.test(name)) return 'Biceps';
        if (/(tricep|pushdown|extension|skull crusher|dips|kickback|overhead triceps|cable push)/.test(name)) return 'Triceps';
        if (/(crunch|leg raise|plank|sit-up|ab roll|russian twist|core|abs)/.test(name)) return 'Abs';
        if (/(shrug|trap raise)/.test(name)) return 'Traps';
        if (/(rear delt|face pull|pec deck reverse|bent over rear delt fly|cable rear delt fly)/.test(name)) return 'Delts';
        if (/(forearm|wrist curl|grip)/.test(name)) return 'Forearms';
        if (/(cardio|run|bike|elliptical|swim|jog|sprint)/.test(name)) return 'Cardio';
        return 'Other';
    }
    
    function getExerciseHistory(exerciseName, limit = null) {
        const history = Object.values(appData.logs.workouts || {})
            .map(log => {
                const foundExercise = log.exercises?.find(ex => ex?.name?.toLowerCase() === exerciseName.toLowerCase());
                return {
                    date: log.date,
                    sets: foundExercise?.sets || [],
                    substitutedFor: foundExercise?.substitutedFor || null 
                };
            })
            .filter(log => log.sets.length > 0)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        return limit ? history.slice(0, limit) : history;
    }

    function getExerciseTrendData(exerciseName) {
        const history = getExerciseHistory(exerciseName); 
        const volumeData = [],
            topSetData = [],
            intensityData = [];
        const prsForExercise = Object.entries(appData.personalRecords || {})
            .filter(([key, record]) => key.startsWith(exerciseName))
            .map(([key, record]) => record);

        history.forEach(log => {
            const totalVolume = log.sets.reduce((t, s) => t + (s.reps * s.weight), 0);
            const totalReps = log.sets.reduce((t, s) => t + s.reps, 0);
            const topSetE1RM = Math.max(...log.sets.map(s => calculateE1RM(s.weight, s.reps)));

            volumeData.push({
                x: log.date,
                y: totalVolume
            });
            topSetData.push({
                x: log.date,
                y: topSetE1RM
            });
            if (totalReps > 0) intensityData.push({
                x: log.date,
                y: totalVolume / totalReps
            });
        });
        return {
            data: {
                datasets: [{
                    label: `${exerciseName} Volume`,
                    data: volumeData,
                    yAxisID: 'y'
                }, {
                    label: `${exerciseName} e1RM`,
                    data: topSetData,
                    yAxisID: 'y1',
                    tension: 0.1,
                    borderDash: [5, 5]
                }, {
                    label: `${exerciseName} Avg Intensity`,
                    data: intensityData,
                    yAxisID: 'y1',
                    tension: 0.1,
                    hidden: true
                }]
            },
            options: {
                plugins: {
                    annotation: {
                        annotations: prsForExercise.map(pr => ({
                            type: 'point',
                            xValue: pr.date,
                            yValue: pr.value,
                            radius: 5,
                            backgroundColor: 'var(--glow-pr)',
                            borderColor: '#fff',
                            borderWidth: 1,
                            pointStyle: 'star',
                            label: {
                                content: `PR: ${pr.value}`,
                                display: true,
                                position: 'top',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                                color: 'var(--glow-pr)',
                                font: {
                                    size: 10,
                                    weight: 'bold'
                                }
                            }
                        }))
                    }
                }
            }
        };
    }
    function getMuscleGroupTrendData(muscleGroup) {
        const dailyVolume = {};
        const workoutLogs = Object.values(appData.logs.workouts || {});

        workoutLogs.forEach(log => {
            log.exercises.forEach(ex => {
                const muscle = guessMuscleGroup(ex.name);
                if (muscle !== 'Rest' && muscle !== 'Other' && muscle !== 'Cardio' && muscle !== 'Abs') {
                    const volume = ex.sets.reduce((t, s) => t + (s.reps * s.weight), 0);
                    dailyVolume[log.date] = (dailyVolume[log.date] || 0) + volume;
                }
            });
        });
        const trendData = Object.entries(dailyVolume)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, volume]) => ({
                x: date,
                y: volume
            }));

        if (trendData.length === 0) return null;

        return {
            label: `${muscleGroup} Volume`,
            data: trendData,
            yAxisID: 'y'
        };
    }
    function getMeasurementTrendDataForPart(partName) {
        const data = Object.values(appData.logs.measurements || {})
            .filter(log => log.data?.[partName])
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(log => ({
                x: log.date,
                y: log.data[partName]
            }));

        const goal = appData.goals.find(g => g.name === partName && g.type === 'measurement');
        let annotations = [];
        if (goal && typeof goal.target === 'number') {
            annotations.push({
                type: 'line',
                yMin: goal.target,
                yMax: goal.target,
                borderColor: 'var(--glow-pr)',
                borderWidth: 2,
                borderDash: [6, 6],
                label: {
                    content: `Goal: ${goal.target}`,
                    enabled: true,
                    position: 'start',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: 'var(--glow-pr)',
                    font: {
                        size: 10,
                        weight: 'bold'
                    }
                }
            });
        }

        return {
            data: {
                datasets: [{
                    label: partName,
                    data: data,
                    borderColor: CHART_COLORS[appData.settings.theme][0],
                    backgroundColor: CHART_COLORS[appData.settings.theme][0] + '40',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: CHART_COLORS[appData.settings.theme][0]
                }]
            },
            options: {
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: `${partName} (${partName === 'Weight' ? appData.settings.weightUnit : appData.settings.distanceUnit})`
                        }
                    }
                },
                plugins: {
                    annotation: {
                        annotations: annotations
                    }
                }
            }
        };
    }
    function generateTrendsOverview() {
        const workoutLogs = getLogsInDateRange(appData.logs.workouts || {}, 90);

        const currentWorkoutStreak = calculateWorkoutStreak();
        const previousWorkoutStreak = calculateWorkoutStreak(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const workoutStreakTrend = getTrend(currentWorkoutStreak, previousWorkoutStreak);

        const currentPlanAdherence = calculatePlanAdherence(30).percentage;
        const previousPlanAdherence = calculatePlanAdherence(30, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).percentage;
        const planAdherenceTrend = getTrend(currentPlanAdherence, previousPlanAdherence);

        const latestWeight = findLatestSaturdayMeasurementLog()?.data?.['Weight'] ?? null;
        const previousWeight = getPreviousWeekSaturdayMeasurement('Weight', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) ?? null;
        const weightTrend = getTrend(latestWeight, previousWeight, true);

        const latestBFP = calculateBFPForSpecificLog(findLatestSaturdayMeasurementLog());
        const previousBFP = calculateBFPForSpecificLog(findLatestSaturdayMeasurementLog(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
        const bfpTrend = getTrend(latestBFP, previousBFP, true);

        const totalVolumeLast30 = workoutLogs.slice(0, 30).reduce((sum, log) => sum + log.exercises.reduce((exSum, ex) => exSum + ex.sets.reduce((setSum, s) => setSum + (s.reps * s.weight), 0), 0), 0);
        const totalVolumePrevious30 = workoutLogs.slice(30, 60)
            .reduce((sum, log) => sum + log.exercises.reduce((exSum, ex) => exSum + ex.sets.reduce((setSum, s) => setSum + (s.reps * s.weight), 0), 0), 0);
        const volumeTrend = getTrend(totalVolumeLast30, totalVolumePrevious30);


        const kpis = [
            createKPI('Workout Streak', `${currentWorkoutStreak} Days`, '', workoutStreakTrend),
            createKPI('Plan Adherence', `${currentPlanAdherence.toFixed(0)}%`, '', planAdherenceTrend),
            createKPI('Weight', latestWeight !== null ? `${latestWeight.toFixed(1)}${appData.settings.weightUnit}` : 'N/A', '', weightTrend),
            createKPI('Body Fat %', latestBFP !== null ? `${latestBFP.toFixed(1)}%` : 'N/A', '', bfpTrend),
            createKPI('Volume (30d)', `${totalVolumeLast30.toLocaleString()}${appData.settings.weightUnit}`, '', volumeTrend),
        ];

        return createCard({
            header: "Overall Trends (Last 30 Days)"
        }, [
            createEl('div', {
                className: 'kpi-grid'
            }, kpis)
        ]);
    }

    function generateWorkoutAnalysis() {
        const workoutLogs = getLogsInDateRange(appData.logs.workouts || {}, 90);
        let insightText = "Not enough workout data for a full analysis.";
        if (workoutLogs.length > 1) {
            const midPoint = Math.floor(workoutLogs.length / 2);
            const firstHalfVolume = workoutLogs.slice(0, midPoint).reduce((sum, log) => sum + log.exercises.reduce((exSum, ex) => exSum + ex.sets.reduce((setSum, s) => setSum + (s.reps * s.weight), 0), 0), 0);
            const secondHalfVolume = workoutLogs.slice(midPoint).reduce((sum, log) => sum + log.exercises.reduce((exSum, ex) => exSum + ex.sets.reduce((setSum, s) => setSum + (s.reps * s.weight), 0), 0), 0);

            if (firstHalfVolume > 0 && secondHalfVolume > firstHalfVolume) {
                const pctChange = ((secondHalfVolume - firstHalfVolume) / firstHalfVolume * 100).toFixed(0);
                insightText = `Your total volume is trending up! You've lifted <strong class="positive">${pctChange}% more</strong> in your recent workouts. Excellent!`;
            } else {
                insightText = "Your total volume is stable or has decreased recently. Focus on progressive overload.";
            }
        }

        const exerciseVariety = getExerciseVariety(workoutLogs);
        let varietyInsight = "Log more workouts to see your exercise variety.";
        if (exerciseVariety.totalExercises > 0) {
            varietyInsight = `You've performed <strong>${exerciseVariety.uniqueExercises} unique exercises</strong> out of ${exerciseVariety.totalExercises} total exercises logged in the last 90 days.`;
        }

        return createCard({
            header: "Workout Performance"
        }, [
            createEl('div', {
                className: 'insight-card',
                innerHTML: insightText
            }),
            createEl('h5', {
                textContent: 'Muscle Group Balance (Last 90d)',
                style: 'margin-top: 20px;'
            }),
            createEl('div', {
                className: 'chart-container',
                style: 'height: 350px'
            }, [createEl('canvas', {
                id: 'analysis-muscle-balance-chart'
            })]),
            createEl('h5', {
                textContent: 'Workout Intensity Distribution (Last 90d)',
                style: 'margin-top: 20px;'
            }),
            createEl('div', {
                className: 'chart-container',
                style: 'height: 350px'
            }, [createEl('canvas', {
                id: 'analysis-workout-intensity-chart'
            })]),
            createEl('h5', {
                textContent: 'Exercise Variety',
                style: 'margin-top: 20px;'
            }),
            createEl('p', {
                innerHTML: varietyInsight,
                style: 'text-align:center; color:var(--text-muted);'
            }),
        ]);
    }

    function generateMeasurementAnalysis() {
        const measurementLogs = getLogsInDateRange(appData.logs.measurements || {}, 90);
        let insightText = "Log measurements consistently to unlock body composition insights.";
        if (measurementLogs.length > 1) {
            const firstBfp = calculateBFPForSpecificLog(measurementLogs[0]);
            const lastBfp = calculateBFPForSpecificLog(measurementLogs[measurementLogs.length - 1]);
            if (firstBfp && lastBfp && lastBfp < firstBfp) {
                insightText = `Great progress! Your estimated Body Fat Percentage has <strong class="positive">decreased by ${(firstBfp - lastBfp).toFixed(1)}%</strong>.`;
            } else {
                insightText = "Your body composition is remaining stable. Consistency is key."
            }
        }
        return createCard({
            header: "Body Transformation Tracker"
        }, [
            createEl('div', {
                className: 'insight-card',
                innerHTML: insightText
            }),
            createEl('h5', {
                textContent: 'Weight & Body Fat vs. Goal (Last 90d)',
                style: 'margin-top: 20px;'
            }),
            createEl('div', {
                className: 'chart-container',
                style: 'height: 350px'
            }, [createEl('canvas', {
                id: 'analysis-ripped-index-chart'
            })]),
        ]);
    }

    function generateHabitAnalysis() {
        const allHabits = appData.dailyChecklist || [];
        let insightText = "Define some daily habits in the Plan tab to track your consistency here!";
        if (allHabits.length > 0) {
            const topHabit = allHabits.reduce((best, current) => {
                const currentConsistency = calculateHabitConsistency(current, 30).score;
                return currentConsistency > best.score ? {
                    name: current,
                    score: currentConsistency
                } : best;
            }, {
                name: '',
                score: -1
            });

            if (topHabit.name) {
                insightText = `Your most consistent habit is "${topHabit.name}" with a <strong class="positive">${topHabit.score.toFixed(0)}% completion rate</strong> in the last 30 days!`;
            } else {
                insightText = "No habit data for analysis yet. Start logging your daily habits!";
            }
        }

        const habitSelectOptions = allHabits.map(habit => createEl('option', {
            value: habit,
            textContent: habit
        }));
        const analysisHabitSelectId = 'analysis-habit-select';
        const content = [
            createEl('div', {
                className: 'insight-card',
                innerHTML: insightText
            }),
            createEl('h5', {
                textContent: 'Habit Completion Trend (Last 90d)',
                style: 'margin-top: 20px;'
            }),
            createEl('div', {
                className: 'adherence-selector-card'
            }, [
                createLabelForInput(analysisHabitSelectId, 'Select Habit:'),
                createEl('select', {
                    id: analysisHabitSelectId
                },
                    [createEl('option', {
                        value: '',
                        textContent: 'Select a habit',
                        disabled: true,
                        selected: true
                    }), ...habitSelectOptions]
                )
            ]),
            createEl('div', {
                className: 'chart-container',
                style: 'height: 350px'
            }, [createEl('canvas', {
                id: 'analysis-habit-trend-chart'
            })]),
        ];

        setTimeout(() => {
            const habitSelect = getEl(analysisHabitSelectId);
            if (habitSelect) {
                if (!habitSelect.value && appData.dailyChecklist.length > 0) {
                    habitSelect.value = appData.dailyChecklist[0];
                }
                habitSelect.addEventListener('change', (e) => {
                    const selectedHabit = e.target.value;
                    const trendData = getHabitCompletionTrendData(selectedHabit, 90);
                    if (trendData.data.labels.length > 0) createChart('analysis-habit-trend-chart', 'line', trendData);
                    else getEl('analysis-habit-trend-chart').parentElement.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Not enough data for this habit trend chart.</p>';
                });
                if (habitSelect.value) {
                    const trendData = getHabitCompletionTrendData(habitSelect.value, 90);
                    if (trendData.data.labels.length > 0) createChart('analysis-habit-trend-chart', 'line', trendData);
                }
            }
        }, 0);

        return createCard({
            header: "Daily Habit Analysis"
        }, content);
    }

    function generateSupplementAnalysis() {
        const allSupplements = appData.supplementLibrary || [];
        let insightText = "Add supplements to your library to track their adherence and effects here!";
        if (allSupplements.length > 0) {
            const mostConsistentSupp = allSupplements.reduce((best, current) => {
                const currentConsistency = calculateSupplementConsistency(current.id, 30).score;
                return currentConsistency > best.score ? {
                    name: current.name,
                    score: currentConsistency
                } : best;
            }, {
                name: '',
                score: -1
            });

            if (mostConsistentSupp.name) {
                insightText = `Your most consistently logged supplement is "${mostConsistentSupp.name}" with a <strong class="positive">${mostConsistentSupp.score.toFixed(0)}% adherence rate</strong> in the last 30 days!`;
            } else {
                insightText = "No supplement data for analysis yet. Start logging your supplements!";
            }
        }

        const supplementSelectOptions = allSupplements.map(supp => createEl('option', {
            value: supp.id,
            textContent: supp.name
        }));
        const analysisSupplementSelectId = 'analysis-supplement-select';
        const content = [
            createEl('div', {
                className: 'insight-card',
                innerHTML: insightText
            }),
            createEl('h5', {
                textContent: 'Supplement Adherence Trend (Last 90d)',
                style: 'margin-top: 20px;'
            }),
            createEl('div', {
                className: 'adherence-selector-card'
            }, [
                createLabelForInput(analysisSupplementSelectId, 'Select Supplement:'),
                createEl('select', {
                    id: analysisSupplementSelectId
                },
                    [createEl('option', {
                        value: '',
                        textContent: 'Select a supplement',
                        disabled: true,
                        selected: true
                    }), ...supplementSelectOptions]
                )
            ]),
            createEl('div', {
                className: 'chart-container',
                style: 'height: 350px'
            }, [createEl('canvas', {
                id: 'analysis-supplement-trend-chart'
            })]),
        ];

        setTimeout(() => {
            const suppSelect = getEl(analysisSupplementSelectId);
            if (suppSelect) {
                if (!suppSelect.value && appData.supplementLibrary.length > 0) {
                    suppSelect.value = appData.supplementLibrary[0].id;
                }
                suppSelect.addEventListener('change', (e) => {
                    const selectedSuppId = e.target.value;
                    const trendData = getSupplementAdherenceTrendData(selectedSuppId, 90);
                    if (trendData.data.labels.length > 0) createChart('analysis-supplement-trend-chart', 'line', trendData);
                    else getEl('analysis-supplement-trend-chart').parentElement.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Not enough data for this supplement trend chart.</p>';
                });
                if (suppSelect.value) {
                    const trendData = getSupplementAdherenceTrendData(suppSelect.value, 90);
                    if (trendData.data.labels.length > 0) createChart('analysis-supplement-trend-chart', 'line', trendData);
                }
            }
        }, 0);

        return createCard({
            header: "Supplement Analysis"
        }, content);
    }
    function showDayDetailsModal(dateStr, tabContext) {
        const workoutLog = appData.logs.workouts?.[dateStr];
        const dailyLog = appData.logs.daily?.[dateStr] || {};
        const { day } = getISTDateInfo(new Date(dateStr));
        const planName = workoutLog?.templateUsed || dailyLog.activePlanName || appData.settings.activeWeeklyPlan;
        const plan = appData.weeklyPlans?.[planName];
        const planned = plan?.plan?.[day]?.exercises || [];
        const exercises = workoutLog?.exercises || [];
        const body = [];
        const title = `Workout · ${getISTDateInfo(new Date(dateStr)).displayDate}`;

        if (dailyLog.skipped) {
            body.push(createEl('p', { className:'activity-modal-status missed', textContent:`Workout skipped${dailyLog.skipped.reason ? ` · ${dailyLog.skipped.reason}` : ''}` }));
        } else if (exercises.length) {
            body.push(createEl('p', { className:'activity-modal-status logged', textContent:`${exercises.length} exercise${exercises.length === 1 ? '' : 's'} logged` }));
            exercises.forEach(ex => {
                const sets = (ex.sets || []).map(set => `${set.reps} × ${set.weight}${appData.settings.weightUnit}`).join('  ·  ');
                body.push(createEl('div', { className:'activity-modal-exercise' }, [
                    createEl('strong', { textContent: ex.name }),
                    sets ? createEl('span', { textContent: sets }) : null
                ].filter(Boolean)));
            });
        } else if (planned.length) {
            body.push(createEl('p', { className:'activity-modal-status missed', textContent:'Workout not logged' }));
        } else {
            body.push(createEl('p', { className:'activity-modal-status rest', textContent:'Rest day / no workout planned' }));
        }

        openModal(title, body, [createButton({ content:'Close', 'data-action':'close-modal' })]);
    }
    
    // --- 11. ADHERENCE & LOGIC FUNCTIONS ---
    
    // FIX: Function added to resolve ReferenceError in Progress Tab (Error 2)
    function buildExerciseSelectorOptions(searchTerm = '') {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const allExercises = [...new Set((appData.exerciseDatabase || []).map(e => e.name))].sort();
        
        // Filter exercises based on search term
        const filteredExercises = allExercises.filter(name => name.toLowerCase().includes(lowerSearchTerm));

        const options = [];
        
        // Add muscle groups as selectable options (prefixed with 'group_')
        const muscleGroups = getAllMuscleGroups().filter(g => g !== 'Other' && g !== 'Rest');
        muscleGroups.forEach(group => {
            const displayGroup = `Group: ${group}`;
            if (displayGroup.toLowerCase().includes(lowerSearchTerm)) {
                options.push(createEl('option', {
                    value: `group_${group}`,
                    textContent: displayGroup
                }));
            }
        });
        
        // Add individual exercises
        filteredExercises.forEach(name => {
            options.push(createEl('option', {
                value: name,
                textContent: name
            }));
        });

        // Add a default instruction if no search term and no exercises
        if (options.length === 0 && !searchTerm) {
             options.push(createEl('option', {
                value: '',
                textContent: 'No exercises found. Log a workout or check Settings > Database.',
                disabled: true
            }));
        }
        
        return options;
    }

    function renderAdherenceCalendar(type, contextId = null) {
        const container = createEl('div', {
            className: 'adherence-calendar-container'
        });
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysSinceMonday = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        const currentMonday = new Date(today);
        currentMonday.setDate(today.getDate() - daysSinceMonday);
        currentMonday.setHours(0, 0, 0, 0);

        const startDate = new Date(currentMonday);
        startDate.setDate(currentMonday.getDate() - (4 * 7)); 

        let totalDaysInDisplay = 35; 

        const grid = createEl('div', {
            className: 'calendar-grid heatmap-grid'
        }); 
        grid.append(...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => createEl('div', {
            className: 'calendar-day-header',
            textContent: d
        })));

        let metDaysInDisplay = 0;

        for (let i = 0; i < totalDaysInDisplay; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const {
                date: dateStr,
                day: dayName
            } = getISTDateInfo(date);
            const isToday = getISTDateInfo(new Date()).date === dateStr;

            let dayClass = `calendar-day heatmap-day ${isToday ? 'today' : ''}`; 
            let isMet = false;
            let isSkipped = false;
            let isOmitted = false;
            let isRestDay = false;

            const dailyLogForDate = appData.logs.daily?.[dateStr] || {};
            const historicalActivePlanName = dailyLogForDate.activePlanName || appData.settings.activeWeeklyPlan;
            const historicalActivePlan = appData.weeklyPlans[historicalActivePlanName];
            
            // NEW: Water Check
            const isWaterMet = type === 'checklist' && contextId === 'Water' && calculateDailyWaterCompletion(dateStr).percentage >= 100;
            if (isWaterMet) {
                dayClass += ' water-met';
                isMet = true;
                metDaysInDisplay++;
            }

            if (type === 'log') {
                const isPlanned = historicalActivePlan?.plan?.[dayName]?.exercises?.length > 0;
                const isDone = !!appData.logs.workouts?.[dateStr] && appData.logs.workouts[dateStr].exercises.length > 0;
                isSkipped = dailyLogForDate.skipped; 
                isOmitted = isSkipped?.omitFromStreak === true; 
                isRestDay = appData.weeklyMuscleSplits?.[dayName]?.includes('Rest'); 

                if (isOmitted) {
                    dayClass += ' omitted-day'; 
                } else if (isPlanned) {
                    if (isDone) {
                        isMet = true;
                        metDaysInDisplay++;
                        dayClass += ' met'; 
                    } else if (isSkipped) {
                        dayClass += ' gym-skipped'; 
                    } else if (isRestDay) {
                        dayClass += ' rest-day'; 
                    } else if (date < today) {
                        dayClass += ' missed'; 
                    }
                } else if (isDone) {
                    dayClass += ' extra'; 
                } else if (isSkipped) { 
                    dayClass += ' gym-skipped missed'; 
                }

            } else if (type === 'measurements') {
                if (!!appData.logs.measurements?.[dateStr]?.data && Object.keys(appData.logs.measurements[dateStr].data).length > 0) {
                    isMet = true;
                    metDaysInDisplay++;
                    dayClass += ' logged-measurements';
                } else if (date < today) {
                    dayClass += ' not-logged-measurements';
                }
            } else if (type === 'checklist' && contextId && contextId !== 'Water') {
                const dailyLog = appData.logs.daily?.[dateStr];
                if (dailyLog?.checklist?.includes(contextId)) {
                    isMet = true;
                    metDaysInDisplay++;
                    dayClass += ' ticked';
                } else if (date < today) {
                    dayClass += ' missed';
                }
            } else if (type === 'supplement' && contextId) {
                const dailyLog = appData.logs.daily?.[dateStr];
                if (contextId === 'Overall') {
                    if (dailyLog?.supplements?.length > 0) {
                        isMet = true;
                        metDaysInDisplay++;
                        dayClass += ' logged-supplements'; 
                    } else if (date < today) {
                        dayClass += ' not-logged-supplements'; 
                    }
                } else if (dailyLog?.supplements?.some(s => s.id === contextId)) {
                    isMet = true;
                    metDaysInDisplay++;
                    dayClass += ' logged-supplements';
                } else if (date < today) {
                    dayClass += ' not-logged-supplements';
                }
            } else if (type === 'abs' && contextId) { 
                const absLog = appData.logs.abs?.[dateStr];
                if (contextId === 'Overall') {
                    if (absLog?.absMuscles?.length > 0) {
                        isMet = true;
                        metDaysInDisplay++;
                        dayClass += ' logged-abs';
                    } else if (date < today) {
                        dayClass += ' not-logged-abs';
                    }
                } else if (absLog?.absMuscles?.includes(contextId)) {
                    isMet = true;
                    metDaysInDisplay++;
                    dayClass += ' logged-abs';
                } else if (date < today) {
                    dayClass += ' not-logged-abs';
                }
            }


            const dayEl = createEl('div', {
                className: dayClass,
                title: dateStr,
                textContent: date.getDate()
            });

            // Add icons for adherence heatmaps
            if (type === 'log' || type === 'progress' || type === 'checklist' || type === 'supplement' || type === 'abs') { 
                if (isOmitted) {
                    dayEl.append(createIcon('fa-eye-slash', 'top-right')); 
                } else if (isMet) { 
                    dayEl.append(createIcon('fa-check-circle', 'top-left')); 
                } else if (isSkipped && !isOmitted) { 
                    dayEl.append(createIcon('fa-ban', 'top-right')); 
                } else if (isWaterMet && type === 'checklist') { // NEW: Water Icon on Water Adherence Map
                    dayEl.append(createIcon('fa-droplet', 'top-left')); 
                }
            }


            if (type === 'log' || type === 'measurements' || type === 'supplements' || type === 'habits' || type === 'analysis' || type === 'notes' || type === 'abs') { 
                dayEl.dataset.action = 'set-log-date';
                dayEl.dataset.date = dateStr;
                if (dateStr === currentLogDate) dayEl.classList.add('selected');
            }
            grid.append(dayEl);
        }

        const consistencyScoreDisplay = totalDaysInDisplay > 0 ? ((metDaysInDisplay / totalDaysInDisplay) * 100).toFixed(0) : 'N/A';
        const scoreEl = createEl('div', {
            className: 'consistency-score'
        }, `Last 5 Weeks Adherence: <strong>${consistencyScoreDisplay}%</strong>`);

        container.append(scoreEl, grid);
        return container;
    }
    function renderCalendar(tabContext, gridClass = 'calendar-grid') {
        const nav = createEl('div', { className: 'calendar-nav' }, [
            createButton({ content: '<i class="fas fa-chevron-left"></i>', 'data-action': 'navigate-calendar', 'data-direction': '-1' }),
            createEl('span', { textContent: calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }),
            createButton({ content: '<i class="fas fa-chevron-right"></i>', 'data-action': 'navigate-calendar', 'data-direction': '1' })
        ]);
        const grid = createEl('div', { className: gridClass });
        const todayDateStr = getISTDateInfo(new Date()).date;
        const month = calendarViewDate.getMonth();
        const year = calendarViewDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
        grid.append(...['M','T','W','T','F','S','S'].map(d => createEl('div', { className:'calendar-day-header', textContent:d })));
        for (let i=0;i<adjustedFirstDay;i++) grid.append(createEl('div',{className:'calendar-day other-month'}));
        for (let day=1;day<=daysInMonth;day++) {
            const date = new Date(year, month, day);
            const dateStr = getISTDateInfo(date).date;
            const hasWorkout = !!(appData.logs.workouts?.[dateStr]?.exercises?.length);
            const dailyLog = appData.logs.daily?.[dateStr] || {};
            const hasPlan = !!(appData.weeklyPlans?.[dailyLog.activePlanName || appData.settings.activeWeeklyPlan]?.plan?.[getISTDateInfo(date).day]?.exercises?.length);
            const isSkipped = !!dailyLog.skipped;
            const status = hasWorkout ? 'logged' : (isSkipped || !hasPlan ? 'rest' : 'missed');
            const isToday = dateStr === todayDateStr;
            const today = new Date(); today.setHours(0,0,0,0);
            const cellDate = new Date(date); cellDate.setHours(0,0,0,0);
            const isFuture = cellDate > today;
            const visualStatus = isFuture ? 'future' : status;
            const dayEl = createEl('div', {
                className: `calendar-day workout-day ${visualStatus} ${isToday ? 'today' : ''}`,
                title: isFuture ? 'Upcoming day' : status === 'logged' ? 'Workout logged' : status === 'missed' ? 'Workout missed' : 'Rest / no workout planned',
                textContent: day,
                'data-action': 'show-day-details',
                'data-date': dateStr,
                'data-tab-context': tabContext
            });
            grid.append(dayEl);
        }
        return [nav, grid];
    }
    
    // --- CALCULATIONS ---

    function calculateWorkoutStreak(endDate = new Date()) {
        let streak = 0;
        const today = new Date(endDate);
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) { 
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const dayName = getISTDateInfo(date).day;

            const hasWorkout = appData.logs.workouts?.[dateStr] && appData.logs.workouts[dateStr].exercises.length > 0;
            const dailyLog = appData.logs.daily?.[dateStr];
            const isSkipped = dailyLog?.skipped;
            const isOmitted = isSkipped?.omitFromStreak === true;
            const isRestDay = appData.weeklyMuscleSplits?.[dayName]?.includes('Rest');

            if (isOmitted) {
                continue;
            } else if (hasWorkout || isRestDay) {
                streak++;
            } else if (isSkipped) { 
                break;
            } else if (i > 0) { 
                break;
            }
        }
        return streak;
    }

    function calculateLongestWorkoutStreak() {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDatesSet = new Set();
        Object.keys(appData.logs.workouts || {}).forEach(date => allDatesSet.add(date));
        Object.keys(appData.logs.daily || {}).forEach(date => allDatesSet.add(date));

        const allDates = Array.from(allDatesSet)
            .sort((a, b) => new Date(a) - new Date(b)); 

        if (allDates.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const date = new Date(dateStr);
            const dayName = getISTDateInfo(date).day;

            const hasWorkout = appData.logs.workouts?.[dateStr] && appData.logs.workouts[dateStr].exercises.length > 0;
            const dailyLog = appData.logs.daily?.[dateStr];
            const isSkipped = dailyLog?.skipped;
            const isOmitted = isSkipped?.omitFromStreak === true;
            const isRestDay = appData.weeklyMuscleSplits?.[dayName]?.includes('Rest');

            if (isOmitted) {
                continue; 
            }

            if (hasWorkout || isRestDay) {
                currentStreak++;
            } else if (isSkipped) { 
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            } else { 
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }

            if (i < allDates.length - 1) {
                const nextDate = new Date(allDates[i + 1]);
                const diffDays = (nextDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays > 1) {
                    for (let d = 1; d < diffDays; d++) {
                        const intermediateDate = new Date(date);
                        intermediateDate.setDate(date.getDate() + d);
                        const intermediateDateStr = getISTDateInfo(intermediateDate).date;
                        const intermediateDayName = getISTDateInfo(intermediateDate).day;

                        const intermediateDailyLog = appData.logs.daily?.[intermediateDateStr];
                        const intermediateSkipped = intermediateDailyLog?.skipped;
                        const intermediateOmitted = intermediateSkipped?.omitFromStreak === true;
                        const intermediateRestDay = appData.weeklyMuscleSplits?.[intermediateDayName]?.includes('Rest');
                        const intermediateHasWorkout = appData.logs.workouts?.[intermediateDateStr] && appData.logs.workouts[intermediateDateStr].exercises.length > 0;


                        if (intermediateOmitted) {
                            continue; 
                        } else if (!intermediateHasWorkout && !intermediateRestDay && (!intermediateSkipped || (intermediateSkipped && !intermediateOmitted))) {
                            longestStreak = Math.max(longestStreak, currentStreak);
                            currentStreak = 0;
                            break; 
                        }
                    }
                }
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak); 
        return longestStreak;
    }
    
    function calculatePlanAdherence(days, endDate = new Date()) {
        let planned = 0,
            done = 0;

        for (let i = 0; i < days; i++) {
            const date = new Date(endDate);
            date.setDate(endDate.getDate() - i);
            const {
                date: dateStr,
                day: dayOfWeek
            } = getISTDateInfo(date);

            const workoutLogForDate = appData.logs.workouts?.[dateStr];
            const dailyLogForDate = appData.logs.daily?.[dateStr] || {};
            const isSkipped = dailyLogForDate.skipped;
            const isOmitted = isSkipped?.omitFromStreak === true;

            const effectivePlan = getEffectiveWorkoutPlanForDate(dateStr, dayOfWeek);
            const planForDayExercises = effectivePlan.plan?.exercises || [];

            if (isOmitted) {
                continue;
            }

            if (planForDayExercises.length > 0 && !isSkipped) {
                planned++;
                const loggedRelevantToPlan = (workoutLogForDate?.exercises || []).some(loggedEx => {
                    return planForDayExercises.some(plannedEx => {
                        return loggedEx.name === plannedEx.name || loggedEx.substitutedFor === plannedEx.name;
                    });
                });

                if (loggedRelevantToPlan) {
                    done++;
                }
            }
        }
        return {
            done,
            planned,
            percentage: planned > 0 ? (done / planned) * 100 : 0
        };
    }

    function getCompletionPercentageHistory(days) {
        const history = {
            labels: [],
            fullLabels: [],
            data: [],
            completed: [],
            planned: []
        };
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) { 
            const date = new Date();
            date.setDate(today.getDate() - i);
            const {
                date: dateStr,
                day: dayOfWeek
            } = getISTDateInfo(date);

            const workoutLogForDate = appData.logs.workouts?.[dateStr];
            const dailyLogForDate = appData.logs.daily?.[dateStr] || {};

            const isSkipped = dailyLogForDate.skipped;
            const isOmitted = isSkipped?.omitFromStreak === true;

            const effectivePlan = getEffectiveWorkoutPlanForDate(dateStr, dayOfWeek);
            const planForDayExercises = effectivePlan.plan?.exercises || [];

            const completedCount = getCompletedPlannedExerciseCount(planForDayExercises, workoutLogForDate?.exercises || []);
            const plannedCount = planForDayExercises.length;
            const percentage = plannedCount > 0 ? (completedCount / plannedCount) * 100 : null;
            const dateObj = new Date(`${dateStr}T00:00:00`);
            const shortLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const fullLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            history.labels.push(shortLabel);
            history.fullLabels.push(fullLabel);
            history.completed.push(completedCount);
            history.planned.push(plannedCount);
            history.data.push(isOmitted || plannedCount === 0 ? null : percentage);
        }
        return history;
    }
    
    function getMuscleGroupBalanceData(logs) {
        const muscleVolume = {};
        logs.forEach(log => {
            log.exercises.forEach(ex => {
                const muscle = guessMuscleGroup(ex.name);
                if (muscle !== 'Rest' && muscle !== 'Other' && muscle !== 'Cardio' && muscle !== 'Abs') {
                    const volume = ex.sets.reduce((t, s) => t + (s.reps * s.weight), 0);
                    muscleVolume[muscle] = (muscleVolume[muscle] || 0) + volume;
                }
            });
        });
        const labels = Object.keys(muscleVolume);
        const data = Object.values(muscleVolume);
        return {
            data: {
                labels,
                datasets: [{
                    label: 'Total Volume by Muscle Group',
                    data
                }]
            }
        };
    }

    function getWorkoutIntensityDistribution(logs) {
        let light = 0,
            moderate = 0,
            heavy = 0;
        logs.forEach(log => {
            log.exercises.forEach(ex => {
                ex.sets.forEach(set => {
                    const e1rm = calculateE1RM(set.weight, set.reps);
                    if (e1rm > 0) {
                        if (e1rm < 50) light++;
                        else if (e1rm >= 50 && e1rm < 100) moderate++;
                        else heavy++;
                    }
                });
            });
        });

        const labels = [];
        const data = [];
        if (light > 0) {
            labels.push('Light (<50 e1RM)');
            data.push(light);
        }
        if (moderate > 0) {
            labels.push('Moderate (50-100 e1RM)');
            data.push(moderate);
        }
        if (heavy > 0) {
            labels.push('Heavy (100+ e1RM)');
            data.push(heavy);
        }

        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Workout Intensity (Sets)',
                    data: data,
                    backgroundColor: [
                        CHART_COLORS[appData.settings.theme][3],
                        CHART_COLORS[appData.settings.theme][0],
                        CHART_COLORS[appData.settings.theme][5]
                    ]
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'category'
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Sets'
                        }
                    }
                }
            }
        }
    }

    function getExerciseVariety(logs) {
        const allExercises = new Set();
        const uniqueExercises = new Set();
        logs.forEach(log => {
            log.exercises.forEach(ex => {
                allExercises.add(ex.name);
                uniqueExercises.add(ex.name);
            });
        });
        return {
            totalExercises: Array.from(allExercises).length,
            uniqueExercises: Array.from(uniqueExercises).length
        };
    }

    function getRippedIndexData(logs) {
        const labels = logs.map(l => l.date);
        const weightData = logs.map(l => l.data?.['Weight'] || null);
        const bfpData = logs.map(calculateBFPForSpecificLog);
        return {
            data: {
                labels,
                datasets: [{
                    label: `Weight (${appData.settings.weightUnit})`,
                    data: weightData,
                    borderColor: CHART_COLORS[appData.settings.theme][1],
                    yAxisID: 'y_weight',
                    tension: 0.1,
                    fill: false
                }, {
                    label: 'Body Fat %',
                    data: bfpData,
                    borderColor: CHART_COLORS[appData.settings.theme][2],
                    yAxisID: 'y_bfp',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'MMM dd'
                        },
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--text-primary')
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--border-color')
                        }
                    },
                    y_weight: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: `Weight (${appData.settings.weightUnit})`
                        }
                    },
                    y_bfp: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Body Fat %'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        };
    }
    
    function getRepRangeDistribution(history) {
        const ranges = {
            strength: 0,
            hypertrophy: 0,
            endurance: 0
        };
        let totalSets = 0;
        history.forEach(log => {
            log.sets.forEach(set => {
                totalSets++;
                if (set.reps >= 1 && set.reps <= 5) ranges.strength++;
                else if (set.reps >= 6 && set.reps <= 12) ranges.hypertrophy++;
                else if (set.reps >= 13) ranges.endurance++;
            });
        });

        const labels = [];
        const data = [];
        if (ranges.strength > 0) {
            labels.push('Strength (1-5 Reps)');
            data.push(ranges.strength);
        }
        if (ranges.hypertrophy > 0) {
            labels.push('Hypertrophy (6-12 Reps)');
            data.push(ranges.hypertrophy);
        }
        if (ranges.endurance > 0) {
            labels.push('Endurance (13+ Reps)');
            data.push(ranges.endurance);
        }

        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Rep Distribution',
                    data: data,
                    backgroundColor: [
                        CHART_COLORS[appData.settings.theme][3],
                        CHART_COLORS[appData.settings.theme][0],
                        CHART_COLORS[appData.settings.theme][1]
                    ]
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'category'
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Sets'
                        }
                    }
                }
            }
        }
    }
    function getSetBySetDropOff(history) {
        const setsData = {};
        let maxSets = 0;

        history.forEach(log => {
            log.sets.forEach((set, index) => {
                const setNum = index + 1;
                if (!setsData[setNum]) {
                    setsData[setNum] = [];
                }
                setsData[setNum].push(set.reps);
                if (setNum > maxSets) maxSets = setNum;
            });
        });

        const labels = [];
        const data = [];

        for (let i = 1; i <= maxSets; i++) {
            labels.push(`Set ${i}`);
            if (setsData[i] && setsData[i].length > 0) {
                const averageReps = setsData[i].reduce((a, b) => a + b, 0) / setsData[i].length;
                data.push(averageReps.toFixed(1));
            } else {
                data.push(0);
            }
        }

        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Reps',
                    data: data,
                    backgroundColor: CHART_COLORS[appData.settings.theme][2]
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'category'
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Sets'
                        }
                    }
                }
            }
        }
    }
    function getTopSets(history, count) {
        return history.flatMap(log =>
            log.sets.map(set => ({
                ...set,
                date: log.date,
                e1rm: calculateE1RM(set.weight, set.reps)
            }))
        ).sort((a, b) => b.e1rm - a.e1rm).slice(0, count);
    }
    function getMaxWeight(history) {
        return Math.max(0, ...history.flatMap(log => log.sets.map(set => set.weight)));
    }
    function getTotalLifetimeVolume(history) {
        return history.reduce((total, log) =>
            total + log.sets.reduce((vol, set) => vol + (set.reps * set.weight), 0), 0);
    }
    function calculateFrequencyMetrics(history) {
        if (history.length < 2) return {
            avgDays: 'N/A',
            countLast30Days: history.length
        };
        const dates = history.map(h => new Date(h.date)).sort((a, b) => a - b);
        const diffs = [];
        for (let i = 1; i < dates.length; i++) {
            diffs.push((dates[i] - dates[i - 1]) / 86400000);
        }
        const avgDays = diffs.reduce((a, b) => a + b, 0) / diffs.length;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const countLast30Days = history.filter(h => new Date(h.date) > thirtyDaysAgo).length;

        return {
            avgDays: avgDays.toFixed(1),
            countLast30Days
        };
    }
    
    function calculateHabitStreak(itemName) {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            if (logForDay?.checklist?.includes(itemName)) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return {
            current: currentStreak
        };
    }
    function calculateLongestHabitStreak(itemName) {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.daily || {}).sort((a, b) => new Date(a) - new Date(b));

        if (allDates.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const logForDay = appData.logs.daily[dateStr];
            if (logForDay?.checklist?.includes(itemName)) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }

    function calculateHabitConsistency(itemName, days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            totalConsideredDays++;
            if (logForDay?.checklist?.includes(itemName)) {
                completedDays++;
            }
        }
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }

    function getHabitCompletionTrendData(habitName, days = 90) {
        const labels = [];
        const data = [];
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            labels.push(dateStr);

            const logForDay = appData.logs.daily?.[dateStr];
            const isCompleted = logForDay?.checklist?.includes(habitName);
            data.push(isCompleted ? 100 : 0);
        }

        return {
            data: {
                labels: labels,
                datasets: [{
                    label: `${habitName} Completion`,
                    data: data,
                    borderColor: CHART_COLORS[appData.settings.theme][0],
                    backgroundColor: CHART_COLORS[appData.settings.theme][0] + '40',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: CHART_COLORS[appData.settings.theme][0]
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Completion (%)'
                        }
                    }
                }
            }
        }
    }
    
   // NEW: Calculate Water Trend Data (Intake graph)
    function getWaterTrendData(days) {
        const labels = [];
        const data = [];
        const goalLine = [];
        const today = new Date();
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            labels.push(dateStr);
            
            const intake = appData.logs.waterLog?.[dateStr]?.intake || 0;
            data.push(intake > 0 ? intake : null);
            goalLine.push(goal);
        }
        
        return {
            data: {
                labels: labels,
                datasets: [{
                    label: 'Intake (L)',
                    data: data,
                    borderColor: '#3b82f6', // <-- UPDATED
                    backgroundColor: 'rgba(59, 130, 246, 0.4)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6' // <-- UPDATED
                },
                {
                    label: 'Goal',
                    data: goalLine,
                    borderColor: 'rgba(250, 204, 21, 0.8)',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    tension: 0,
                    fill: false
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Liters' }
                    }
                }
            }
        };
    }
    
    function renderDailyChecklist(checkedItems = []) {
        const container = createEl('div', {
            id: 'daily-checklist-container'
        });
        (appData.dailyChecklist || []).forEach(item => {
            const checkboxId = `log-check-${item.replace(/\s+/g, '-')}`;
            container.append(createEl('div', {
                className: 'checklist-item'
            }, [
                createInput({
                    type: 'checkbox',
                    id: checkboxId,
                    checked: checkedItems.includes(item),
                    'data-item': item,
                    'data-action': 'toggle-habit-completion'
                }),
                createEl('label', {
                    htmlFor: checkboxId,
                    textContent: item
                })
            ]));
        });
        return container;
    }
    function addChecklistItem() {
        const input = getEl('new-checklist-item-input');
        if (input && input.value.trim() && !(appData.dailyChecklist || []).includes(input.value.trim())) {
            appData.dailyChecklist.push(input.value.trim());
            input.value = '';
            render('plan');
            saveData();
            showToast('Habit added!', 'success');
        } else {
            showToast('Invalid or duplicate habit name.', 'error');
        }
    }
    function deleteChecklistItem(itemToDelete) {
        appData.dailyChecklist = (appData.dailyChecklist || []).filter(item => item !== itemToDelete);
        Object.values(appData.logs.daily || {}).forEach(log => {
            if (log.checklist) {
                log.checklist = log.checklist.filter(item => item !== itemToDelete);
                if (Object.keys(log).length === 1 && log.checklist.length === 0 && (!log.supplements || log.supplements.length === 0) && !log.skipped) {
                    delete appData.logs.daily[log.date];
                }
            }
        });
        render('plan');
        saveData();
        showToast('Habit deleted!', 'info');
    }
    
    // NEW: Calculate Water Consistency (used by Adherence Map)
    function calculateWaterConsistencyOverall(days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0

        if (goal === 0) return { score: 0, completedDays: 0, totalDays: 0 };
        
        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            
            totalConsideredDays++;
            const intake = appData.logs.waterLog?.[dateStr]?.intake || 0;
            if (intake >= goal) {
                completedDays++;
            }
        }
        
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }
    
    function calculateSupplementConsistency(suppId, days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            totalConsideredDays++;
            if (logForDay?.supplements?.some(s => s.id === suppId)) {
                completedDays++;
            }
        }
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }

    function getSupplementAdherenceTrendData(supplementId, days = 90) {
        const labels = [];
        const data = [];
        const today = new Date();

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            labels.push(dateStr);

            const logForDay = appData.logs.daily?.[dateStr];
            const isAdhered = logForDay?.supplements?.some(s => s.id === supplementId);
            data.push(isAdhered ? 100 : 0);
        }
        return {
            data: {
                labels: labels,
                datasets: [{
                    label: `Adherence`,
                    data: data,
                    borderColor: CHART_COLORS[appData.settings.theme][1],
                    backgroundColor: CHART_COLORS[appData.settings.theme][1] + '40',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: CHART_COLORS[appData.settings.theme][1]
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Adherence (%)'
                        }
                    }
                }
            }
        }
    }
    
    function renderSupplementLibrary(container) {
        if (!container) return;
        container.innerHTML = '';
        (appData.supplementLibrary || []).forEach(supp => {
            const deleteBtnId = `delete-supp-btn-${supp.id}`;
            container.append(createEl('div', {
                className: 'list-item'
            }, [
                createEl('span', {
                    textContent: `${supp.name}`
                }),
                createButton({
                    id: deleteBtnId,
                    content: '<i class="fas fa-trash"></i>',
                    className: 'danger',
                    'data-action': 'delete-supplement',
                    'data-id': supp.id
                })
            ]));
        });
    }
    async function addSupplementToLibrary() {
        const name = await showPrompt('New Supplement Name:');
        if (name) {
            (appData.supplementLibrary = appData.supplementLibrary || []).push({
                id: `supp_${Date.now()}`,
                name: name,
                notes: []
            });
            render('supplements');
            saveData();
            showToast('Supplement added!', 'success');
        }
    }
    async function deleteSupplementFromLibrary(id) {
        if (await showConfirmation("Delete this supplement? This will remove all associated data.")) {
            appData.supplementLibrary = (appData.supplementLibrary || []).filter(s => s.id !== id);
            Object.values(appData.logs.daily || {}).forEach(log => {
                if (log.supplements) {
                    log.supplements = log.supplements.filter(s => s.id !== id);
                    if (Object.keys(log).length === 1 && log.supplements.length === 0 && (!log.checklist || log.checklist.length === 0) && !log.skipped) {
                        delete appData.logs.daily[log.date];
                    }
                }
            });
            saveData();
            render('supplements');
            showToast('Supplement deleted!', 'info');
        }
    }
    function togglePRDetails(prKey) {
        const detailRow = document.querySelector(`.pr-detail-row[data-details-for=\"${prKey}\"]`);
        const header = document.querySelector(`.pr-item-header[data-pr-key=\"${prKey}\"]`);
        if (detailRow && header) {
            detailRow.classList.toggle('active');
            header.classList.toggle('active');
        }
    }

    function setAbsAdherenceView(absName) {
        selectedAbsForAdherence = absName;
        const adherenceMapContainer = getEl('selected-abs-adherence-map');
        const infoCardContainer = getEl('selected-abs-info-card');

        if (!adherenceMapContainer || !infoCardContainer) return;

        adherenceMapContainer.innerHTML = '';
        infoCardContainer.innerHTML = '';

        if (absName === 'Overall') {
            const consistency = calculateAbsConsistencyOverall(30);
            const currentStreak = calculateAbsStreakOverall().current;
            const longestStreak = calculateLongestAbsStreakOverall();
            
            adherenceMapContainer.append(renderAdherenceCalendar('Overall'));
            
            const infoContent = createEl('div', { className: 'kpi-grid' }, [
                createKPI('Daily Compliance (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);
        } else {
            const consistency = calculateAbsConsistency(absName, 30);
            const currentStreak = calculateAbsStreak(absName).current;
            const longestStreak = calculateLongestAbsStreak(absName);
            
            adherenceMapContainer.append(renderAdherenceCalendar(absName));
            
            const infoContent = createEl('div', { className: 'kpi-grid' }, [
                createKPI('Consistency (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);
        }
        
        document.querySelectorAll('#abs-button-nav-container .adherence-nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.absName === absName) {
                btn.classList.add('active');
            }
        });
    }

    function setHabitAdherenceView(habitName) {
        selectedHabitForAdherence = habitName;
        const adherenceMapContainer = getEl('selected-habit-adherence-map');
        const infoCardContainer = getEl('selected-habit-info-card');

        if (!adherenceMapContainer || !infoCardContainer) return;

        adherenceMapContainer.innerHTML = '';
        infoCardContainer.innerHTML = '';

        if (!habitName) {
            adherenceMapContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Select a habit to view its adherence.</p>';
            infoCardContainer.innerHTML = '';
            return;
        }
        
        // Handle Water Adherence Separately
        if (habitName === 'Water') {
            const consistency = calculateWaterConsistencyOverall(30);
            const currentStreak = calculateWaterStreakOverall().current;
            const longestStreak = calculateLongestWaterStreakOverall();
            
            adherenceMapContainer.append(renderAdherenceCalendar('checklist', 'Water'));

            const infoContent = createEl('div', {
                className: 'kpi-grid'
            }, [
                createKPI('Consistency (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);
        } else {
            const adherenceCalendar = renderAdherenceCalendar('checklist', habitName);
            adherenceMapContainer.append(adherenceCalendar);

            const consistency = calculateHabitConsistency(habitName, 30);
            const currentStreak = calculateHabitStreak(habitName).current;
            const longestStreak = calculateLongestHabitStreak(habitName);

            const infoContent = createEl('div', {
                className: 'kpi-grid'
            }, [
                createKPI('Consistency (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);
        }
        
        document.querySelectorAll('#habit-button-nav-container .adherence-nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.habitName === habitName) {
                btn.classList.add('active');
            }
        });
    }

    function setSupplementAdherenceView(suppId) {
        selectedSupplementForAdherence = suppId;
        const adherenceMapContainer = getEl('selected-supplement-adherence-map');
        const infoCardContainer = getEl('selected-supplement-info-card');

        if (!adherenceMapContainer || !infoCardContainer) return;

        adherenceMapContainer.innerHTML = '';
        infoCardContainer.innerHTML = '';

        if (!suppId) {
            adherenceMapContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Select a supplement or the Overall view to track adherence.</p>';
            infoCardContainer.innerHTML = '';
            return;
        }
        
        if (suppId === 'Overall') {
            const consistency = calculateSupplementConsistencyOverall(30);
            const currentStreak = calculateSupplementStreakOverall().current;
            const longestStreak = calculateLongestSupplementStreakOverall();
            
            adherenceMapContainer.append(renderAdherenceCalendar('supplement', 'Overall'));

            const infoContent = createEl('div', {
                className: 'kpi-grid'
            }, [
                createKPI('Daily Compliance (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);

        } else {
            const adherenceCalendar = renderAdherenceCalendar('supplement', suppId);
            adherenceMapContainer.append(adherenceCalendar);

            const consistency = calculateSupplementConsistency(suppId, 30);
            const currentStreak = calculateSupplementStreak(suppId).current;
            const longestStreak = calculateLongestSupplementStreak(suppId);

            const infoContent = createEl('div', {
                className: 'kpi-grid'
            }, [
                createKPI('Consistency (30d)', `${consistency.score.toFixed(0)}%`, `(${consistency.completedDays}/${consistency.totalDays})`),
                createKPI('Current Streak', `${currentStreak} Days`),
                createKPI('Longest Streak', `${longestStreak} Days`)
            ]);
            infoCardContainer.append(infoContent);
        }
        
        document.querySelectorAll('#supplement-button-nav-container .adherence-nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.suppId === suppId) {
                btn.classList.add('active');
            }
        });
    }

    // NEW: Calculate Overall Supplement Consistency
    function calculateSupplementConsistencyOverall(days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (appData.supplementLibrary?.length === 0) return { score: 0, completedDays: 0, totalDays: 0 };

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            totalConsideredDays++;
            if (logForDay?.supplements?.length > 0) {
                completedDays++;
            }
        }
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }
    
    // NEW: Calculate Overall Supplement Streak
    function calculateSupplementStreakOverall() {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (appData.supplementLibrary?.length === 0) return { current: 0 };

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            if (logForDay?.supplements?.length > 0) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return { current: currentStreak };
    }

    // NEW: Calculate Longest Overall Supplement Streak
    function calculateLongestSupplementStreakOverall() {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.daily || {}).sort((a, b) => new Date(a) - new Date(b));

        if (appData.supplementLibrary?.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const logForDay = appData.logs.daily[dateStr];
            if (logForDay?.supplements?.length > 0) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }


    function calculateSupplementStreak(suppId) {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const logForDay = appData.logs.daily?.[dateStr];

            if (logForDay?.supplements?.some(s => s.id === suppId)) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return {
            current: currentStreak
        };
    }

    function calculateLongestSupplementStreak(suppId) {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.daily || {}).sort((a, b) => new Date(a) - new Date(b));

        if (allDates.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const logForDay = appData.logs.daily[dateStr];
            if (logForDay?.supplements?.some(s => s.id === suppId)) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }
    
    // NEW: Calculate Abs Streak (Individual muscle group)
    function calculateAbsStreak(absGroup) {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const absLog = appData.logs.abs?.[dateStr];
            
            if (absLog?.absMuscles?.includes(absGroup)) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return {
            current: currentStreak
        };
    }
    
    // NEW: Calculate Overall Abs Streak (at least one group logged)
    function calculateAbsStreakOverall() {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const absLog = appData.logs.abs?.[dateStr];

            if (absLog?.absMuscles?.length > 0) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return {
            current: currentStreak
        };
    }

    // NEW: Calculate Longest Abs Streak (Individual muscle group)
    function calculateLongestAbsStreak(absGroup) {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.abs || {}).sort((a, b) => new Date(a) - new Date(b));

        if (allDates.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const absLog = appData.logs.abs[dateStr];
            if (absLog?.absMuscles?.includes(absGroup)) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }
    
    // NEW: Calculate Longest Overall Abs Streak (at least one group logged)
    function calculateLongestAbsStreakOverall() {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.abs || {}).sort((a, b) => new Date(a) - new Date(b));

        if (allDates.length === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const absLog = appData.logs.abs[dateStr];
            if (absLog?.absMuscles?.length > 0) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }
    
    // NEW: Calculate Water Streak (Overall)
    function calculateWaterStreakOverall() {
        let currentStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0

        if (goal === 0) return { current: 0 };
        
        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const intake = appData.logs.waterLog?.[dateStr]?.intake || 0;

            if (intake >= goal) {
                currentStreak++;
            } else {
                if (date < today) {
                    break;
                }
            }
        }
        return { current: currentStreak };
    }
    
    // NEW: Calculate Longest Water Streak (Overall)
    function calculateLongestWaterStreakOverall() {
        let longestStreak = 0;
        let currentStreak = 0;
        const allDates = Object.keys(appData.logs.waterLog || {}).sort((a, b) => new Date(a) - new Date(b));
        const goal = appData.settings.waterGoal || 4.0; // MOD: Default to 4.0

        if (allDates.length === 0 || goal === 0) return 0;

        for (let i = 0; i < allDates.length; i++) {
            const dateStr = allDates[i];
            const intake = appData.logs.waterLog[dateStr]?.intake || 0;
            if (intake >= goal) {
                currentStreak++;
            } else {
                longestStreak = Math.max(longestStreak, currentStreak);
                currentStreak = 0;
            }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
        return longestStreak;
    }


    function calculateDailyHabitCompletion(dateStr) {
        const todayLog = appData.logs.daily?.[dateStr] || {
            checklist: []
        };
        const completedCount = todayLog.checklist?.length || 0;
        const totalCount = appData.dailyChecklist?.length || 0;
        const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        return {
            completedCount,
            totalCount,
            percentage
        };
    }

    function calculateDailySupplementCompletion(dateStr) {
        const todayLog = appData.logs.daily?.[dateStr] || {
            supplements: []
        };
        const completedCount = todayLog.supplements?.length || 0;
        const totalCount = appData.supplementLibrary?.length || 0;
        const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        return {
            completedCount,
            totalCount,
            percentage
        };
    }
    
    function calculateAbsConsistencyOverall(days = 30) {
        let completedDays = 0;
        let totalConsideredDays = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (appData.absMuscleGroups?.length === 0) return { score: 0, completedDays: 0, totalDays: 0 };

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = getISTDateInfo(date).date;
            const absLog = appData.logs.abs?.[dateStr];

            totalConsideredDays++;
            if (absLog?.absMuscles?.length > 0) {
                completedDays++;
            }
        }
        return {
            score: totalConsideredDays > 0 ? (completedDays / totalConsideredDays) * 100 : 0,
            totalDays: totalConsideredDays,
            completedDays: completedDays
        };
    }
    
    // FIX: New helper functions to preserve Log tab state (copied from original source)
    function captureLogState() {
        const state = {
            inputs: {},
            completed: [],
            expanded: {
                ...expandedLogCards
            }
        };
        document.querySelectorAll('#log .exercise-card').forEach(card => {
            const exerciseName = card.dataset.exerciseName;
            if (card.classList.contains('completed')) {
                state.completed.push(exerciseName);
            }
            card.querySelectorAll('.set-entry input').forEach(input => {
                state.inputs[input.id] = input.value;
            });
        });
        return state;
    }

    function restoreLogState(state) {
        if (!state) return;
        Object.keys(state.inputs).forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = state.inputs[inputId];
            }
        });
        state.completed.forEach(exerciseName => {
            const card = document.querySelector(`#log .exercise-card[data-exercise-name=\"${exerciseName}\"]`);
            if (card) {
                card.classList.add('completed');
            }
        });
        expandedLogCards = {
            ...state.expanded
        };
        Object.keys(expandedLogCards).forEach(logId => {
            const card = document.querySelector(`.exercise-card[data-log-id=\"${logId}\"]`);
            if (card && expandedLogCards[logId]) {
                card.classList.add('expanded');
            }
        });
        updateSaveWorkoutButtonState();
    }
    
    // --- v2.0 minimal redesign overrides ---
// GymTrack AI v2.0 minimal redesign overrides
// Generated from the user's requested design direction.

function renderDashboard() {
    const { day, date, displayDate } = getISTDateInfo();
    const effectivePlan = getEffectiveWorkoutPlanForDate(date, day);
    const todaysPlan = effectivePlan.plan || { exercises: [], name: 'Rest Day' };
    const plannedExercises = todaysPlan.exercises || [];
    const todaysLog = appData.logs.workouts?.[date];
    const completed = getCompletedPlannedExerciseCount(plannedExercises, todaysLog?.exercises || []);
    const todayPct = plannedExercises.length ? Math.min(100, completed / plannedExercises.length * 100) : null;
    const completionHistory = getCompletionPercentageHistory(30);
    const plannedDayValues = completionHistory.data.filter(value => value !== null);
    const averageDailyCompletion = plannedDayValues.length ? plannedDayValues.reduce((sum, value) => sum + value, 0) / plannedDayValues.length : 0;
    const workoutDays = plannedDayValues.filter(value => value > 0).length;
    const streak = calculateWorkoutStreak();
    const longestStreak = calculateLongestWorkoutStreak();

    const statusText = plannedExercises.length === 0 ? 'Rest day' : completed >= plannedExercises.length ? 'Workout complete' : completed > 0 ? 'Workout in progress' : 'Workout not started';
    const statusClass = plannedExercises.length === 0 ? 'neutral' : completed >= plannedExercises.length ? 'success' : completed > 0 ? 'info' : 'muted';

    const todayCard = createCard({ header: 'Today', cardClass: 'minimal-dashboard-card' }, [
        createEl('div', { className: 'dashboard-date', textContent: displayDate }),
        createEl('div', { className: 'dashboard-today-row' }, [
            createEl('div', {}, [
                createEl('div', { className: 'dashboard-plan-name', textContent: plannedExercises.length ? (todaysPlan.name || 'Workout') : 'Rest Day' }),
                createEl('div', { className: `dashboard-status ${statusClass}`, textContent: statusText })
            ]),
            createEl('div', { className: 'dashboard-completion-value', textContent: todayPct === null ? '—' : `${todayPct.toFixed(0)}%` })
        ]),
        plannedExercises.length
            ? createEl('div', { className: 'dashboard-progress-track' }, [createEl('div', { className: 'dashboard-progress-fill', style: `width:${todayPct}%;` })])
            : createEl('div', { className: 'dashboard-rest-note', textContent: 'No workout is planned for today.' })
    ]);

    const completionCard = createCard({ header: 'Daily Workout Completion · Last 30 Days', cardClass: 'minimal-dashboard-card dashboard-completion-card' }, [
        createEl('div', { className: 'dashboard-average-row' }, [
            createEl('div', {}, [
                createEl('div', { className: 'dashboard-stat-primary', textContent: `${averageDailyCompletion.toFixed(0)}%` }),
                createEl('div', { className: 'dashboard-stat-label', textContent: '30-day average' })
            ]),
            createEl('div', { className: 'dashboard-secondary-stat' }, [createEl('strong', { textContent: `${workoutDays}` }), createEl('span', { textContent: 'workout days' })])
        ]),
        createEl('div', { className: 'dashboard-chart-wrap' }, [createEl('canvas', { id: 'dashboard-completion-chart' })]),
        createEl('div', { className: 'dashboard-chart-note', textContent: 'Rest days are neutral. Missed planned workouts are 0%.' }),
        createEl('div', { className: 'dashboard-two-stats' }, [
            createEl('div', { className: 'dashboard-streak-stat' }, [createEl('strong', { textContent: `${streak}` }), createEl('span', { textContent: 'day streak' })]),
            createEl('div', { className: 'dashboard-streak-stat' }, [createEl('strong', { textContent: `${longestStreak}` }), createEl('span', { textContent: 'longest streak' })])
        ])
    ]);

    return [todayCard, completionCard];
}

function renderLogWorkout() {
    const logDateObj = new Date(currentLogDate);
    const { date, day } = getISTDateInfo(logDateObj);
    let exercisesToDisplay = [];
    let planSourceText = '';

    if (loadedCustomWorkoutName && appData.customWorkouts[loadedCustomWorkoutName]) {
        exercisesToDisplay = appData.customWorkouts[loadedCustomWorkoutName].exercises;
        planSourceText = ` · ${loadedCustomWorkoutName}`;
    } else {
        const activePlan = appData.weeklyPlans[appData.settings.activeWeeklyPlan];
        const planForDay = activePlan?.plan?.[day] || { exercises: [] };
        exercisesToDisplay = planForDay.exercises;
        planSourceText = activePlan?.name ? ` · ${activePlan.name}` : '';
    }

    if (!currentSessionExercises) {
        currentSessionExercises = JSON.parse(JSON.stringify(exercisesToDisplay)).map((ex, index) => ({
            ...ex,
            log_id: `log_ex_${index}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        }));
    } else {
        currentSessionExercises = currentSessionExercises.map(ex => ({ ...ex, log_id: ex.log_id || `log_ex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` }));
    }

    const todaysLog = appData.logs.workouts?.[date] || { exercises: [] };
    const dateSelector = createEl('div', { className: 'log-date-selector' }, [
        createButton({ content: '<i class="fas fa-chevron-left"></i>', 'data-action': 'set-log-date', 'data-date': getISTDateInfo(new Date(logDateObj.getTime() - 86400000)).date, className: 'icon-nav-button' }),
        createEl('span', { className: 'date-display' }, [
            createEl('strong', { textContent: getISTDateInfo(new Date(currentLogDate)).displayDate }),
            createEl('span', { className: 'plan-source-text', textContent: planSourceText })
        ]),
        createButton({ content: '<i class="fas fa-chevron-right"></i>', 'data-action': 'set-log-date', 'data-date': getISTDateInfo(new Date(logDateObj.getTime() + 86400000)).date, className: 'icon-nav-button' })
    ]);

    const exerciseCards = renderLogExerciseCards(todaysLog, { exercises: currentSessionExercises });
    const actions = createEl('div', { className: 'log-actions minimal-action-group' }, [
        createButton({ id: 'load-workout-button', content: '<i class="fas fa-folder-open"></i> Load Workout', 'data-action': 'show-load-workout-modal', className: 'secondary-button log-action-load' }),
        createButton({ id: 'add-exercise-button', content: '<i class="fas fa-plus"></i> Add Exercise', 'data-action': 'open-exercise-modal', className: 'secondary-button' }),
        createButton({ id: 'save-workout-button', content: '<i class="fas fa-check"></i> Save Workout', 'data-action': 'save-workout', className: 'primary-button' })
    ]);

    if (exerciseCards.length === 0) {
        return [dateSelector, createCard({ header: 'Workout Log', cardClass: 'minimal-dashboard-card log-empty-card' }, [
            createEl('div', { className: 'card-empty-state' }, [
                createEl('i', { className: 'fas fa-moon' }),
                createEl('p', { textContent: 'No workout is planned for this day.' })
            ])
        ]), actions];
    }

    const container = createEl('div', { id: 'log-exercise-cards', className: 'log-exercise-list' });
    container.append(...exerciseCards);
    return [dateSelector, container, actions];
}

function renderLogExerciseCards(todaysLog, currentPlan) {
    const exerciseCards = [];
    const allExercisesMap = new Map();
    (currentPlan?.exercises || []).forEach((ex, index) => {
        allExercisesMap.set(ex.name, { ...ex, isPlanned: true, log_id: ex.log_id || `log_ex_${index}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` });
    });
    (todaysLog?.exercises || []).forEach(loggedEx => {
        allExercisesMap.set(loggedEx.name, { ...allExercisesMap.get(loggedEx.name), ...loggedEx, isLogged: true, log_id: loggedEx.log_id || `log_ex_logged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` });
    });
    const orderedExercises = (currentPlan?.exercises || []).map(ex => allExercisesMap.get(ex.name)).filter(Boolean);
    (todaysLog?.exercises || []).forEach(loggedEx => {
        if (!orderedExercises.some(ex => ex.name === loggedEx.name)) orderedExercises.push({ ...loggedEx, isLogged: true, isPlanned: false, log_id: loggedEx.log_id || `log_ex_adhoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` });
    });
    orderedExercises.forEach(ex => exerciseCards.push(renderExerciseCard(ex)));
    return exerciseCards;
}

function renderExerciseCard(exerciseData) {
    const { name, sets, substitutedFor, isLogged } = exerciseData;
    const isCompleted = !!isLogged;
    const safeExerciseName = name.replace(/\s+/g, '-').toLowerCase();
    const isExpanded = expandedLogCards[exerciseData.log_id] || false;
    const card = createEl('div', { className: `card exercise-card minimal-exercise-card ${isCompleted ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}`, 'data-exercise-name': name, 'data-substituted-for': substitutedFor || '', 'data-log-id': exerciseData.log_id || `log_ex_card_${Date.now()}` });
    const header = createEl('div', { className: 'exercise-header', 'data-action': 'toggle-log-card-details', 'data-log-id': exerciseData.log_id }, [
        createEl('div', { className: 'exercise-title-group' }, [
            createEl('span', { className: 'exercise-title', textContent: name }),
            substitutedFor ? createEl('span', { className: 'exercise-sub-heading', textContent: `Swapped from: ${substitutedFor}` }) : null
        ]),
        createEl('div', { className: 'exercise-actions-group' }, [
            createButton({ content: '<i class="fas fa-exchange-alt"></i>', className: 'exercise-swap-btn icon-action-button', 'data-action': 'show-swap-exercise-modal', 'data-exercise-name': name, title: 'Swap Exercise' }),
            createButton({ content: '<i class="fas fa-check"></i>', className: 'exercise-tick-btn icon-action-button', 'data-action': 'toggle-exercise-complete', title: 'Mark complete' })
        ])
    ]);
    const detailsContainer = createEl('div', { className: 'exercise-details' });
    const setsContainer = createEl('div', { className: 'sets-container' });
    const setsToRender = Array.isArray(exerciseData.sets) ? exerciseData.sets.slice(0, 3) : [];
    if (setsToRender.length > 0) {
        setsToRender.forEach((set, i) => setsContainer.append(createSetEntry(i + 1, set.reps, set.weight, exerciseData.log_id)));
    } else {
        for (let i = 0; i < 3; i++) setsContainer.append(createSetEntry(i + 1, '', '', exerciseData.log_id));
    }
    detailsContainer.append(setsContainer);
    card.append(header, detailsContainer);
    return card;
}

function addSetToExercise(card) {
    if (!card) return;
    const count = card.querySelectorAll('.set-entry').length;
    if (count >= 3) {
        showToast('Each exercise is limited to 3 sets.', 'info');
        return;
    }
    const container = card.querySelector('.sets-container');
    if (container) container.append(createSetEntry(count + 1, '', '', card.dataset.logId));
    updateSaveWorkoutButtonState();
}

function saveWorkout() {
    closeModal();
    const date = currentLogDate;
    const workoutData = { date, exercises: [], templateUsed: loadedCustomWorkoutName || appData.settings.activeWeeklyPlan };
    document.querySelectorAll('#log .exercise-card.completed').forEach(card => {
        const exerciseName = card.dataset.exerciseName;
        const substitutedFor = card.dataset.substitutedFor || null;
        if (!exerciseName) return;
        const sets = [];
        Array.from(card.querySelectorAll('.set-entry')).slice(0, 3).forEach(setEl => {
            const reps = parseFloat(setEl.querySelector('[data-type="reps"]').value);
            const weight = parseFloat(setEl.querySelector('[data-type="weight"]').value);
            if (reps > 0 && !isNaN(weight) && weight >= 0) {
                sets.push({ reps, weight });
                checkAndSavePR(exerciseName, reps, weight, date);
            }
        });
        if (sets.length > 0) workoutData.exercises.push({ name: exerciseName, sets, substitutedFor });
    });
    if (workoutData.exercises.length > 0) {
        appData.logs.workouts[date] = workoutData;
        if (appData.logs.daily[date]?.skipped) delete appData.logs.daily[date].skipped;
        saveData();
        showToast(`${workoutData.exercises.length} exercise(s) saved!`, 'success');
        render('log'); render('dashboard'); render('snapshot');
    } else if (appData.logs.workouts[date]?.exercises?.length > 0) {
        delete appData.logs.workouts[date];
        saveData();
        showToast('Workout log cleared for this day.', 'info');
        render('log'); render('dashboard'); render('snapshot');
    } else {
        showToast('Complete at least one exercise with valid sets before saving.', 'error');
    }
    updateSaveWorkoutButtonState();
}

function renderSnapshot() {
    let exercisesForSnapshot = [];
    const { day: currentDayOfWeek } = getISTDateInfo(new Date(currentLogDate));
    const activePlan = appData.weeklyPlans[appData.settings.activeWeeklyPlan];
    const todaysPlan = activePlan?.plan?.[currentDayOfWeek] || { exercises: [] };
    exercisesForSnapshot = currentSessionExercises || todaysPlan.exercises;

    const views = [
        { label: 'All', value: 'allTime' },
        { label: 'Last 3', value: 'last3' },
        { label: 'Last 5', value: 'last5' },
        { label: 'Month', value: 'thisMonth' }
    ];
    const viewOptionsContainer = createEl('div', { className: 'snapshot-view-options-container minimal-segmented-control' });
    views.forEach(view => viewOptionsContainer.append(createButton({ content: view.label, 'data-action': 'set-snapshot-view', 'data-view': view.value, className: snapshotHistoryView === view.value ? 'active' : 'secondary-button' })));

    const todaysPlanName = loadedCustomWorkoutName || todaysPlan.name || 'No Plan for Today';
    const snapshotHeaderCard = createCard({ header: `Snapshot · ${getISTDateInfo(new Date(currentLogDate)).displayDate}`, cardClass: 'minimal-dashboard-card snapshot-header-card' }, [
        createEl('div', { className: 'snapshot-plan-line' }, [createEl('strong', { textContent: todaysPlanName }), createEl('span', { textContent: '3 sets max per exercise' })]),
        viewOptionsContainer
    ]);

    if (!exercisesForSnapshot || exercisesForSnapshot.length === 0) {
        return [snapshotHeaderCard, createEl('div', { className: 'card-empty-state' }, [createEl('i', { className: 'fas fa-camera-retro' }), createEl('p', { textContent: 'No workout planned or loaded for this day.' })])];
    }
    return [snapshotHeaderCard, ...renderSnapshotContent([...new Set(exercisesForSnapshot.map(ex => ex.name))])];
}

function renderSnapshotHistory(exerciseName, rawHistory) {
    const container = createEl('div', { className: 'snapshot-history-table-wrapper' });
    let history = [...rawHistory];
    if (snapshotHistoryView === 'last3') history = history.slice(0, 3);
    else if (snapshotHistoryView === 'last5') history = history.slice(0, 5);
    else if (snapshotHistoryView === 'thisMonth') {
        const firstDayOfMonth = new Date(currentLogDate); firstDayOfMonth.setDate(1);
        history = history.filter(log => new Date(log.date) >= firstDayOfMonth);
    }
    if (!history.length) {
        container.append(createEl('p', { textContent: 'No matching history found.', className: 'snapshot-empty' }));
        return container;
    }
    const table = createEl('table', { className: 'snapshot-history-table minimal-snapshot-table' });
    table.append(createEl('thead', {}, [createEl('tr', {}, [
        createEl('th', { textContent: 'Date' }), createEl('th', { textContent: 'Set 1' }), createEl('th', { textContent: 'Set 2' }), createEl('th', { textContent: 'Set 3' })
    ])]));
    const tbody = createEl('tbody');
    history.forEach((log, index) => {
        const volume = (log.sets || []).slice(0, 3).reduce((total, set) => total + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0);
        const previous = history[index + 1];
        const previousVolume = previous ? (previous.sets || []).slice(0, 3).reduce((total, set) => total + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0) : null;
        const trend = previousVolume === null || previousVolume === 0 ? 'neutral' : volume > previousVolume * 1.005 ? 'positive' : volume < previousVolume * 0.995 ? 'negative' : 'neutral';
        const dateText = new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const sets = (log.sets || []).slice(0, 3);
        const formatSet = set => set && (Number(set.reps) > 0 || Number(set.weight) > 0) ? `${set.weight}${appData.settings.weightUnit} × ${set.reps}` : '—';
        const dateCell = createEl('td', { className: `snapshot-date-cell ${trend}`, title: trend === 'positive' ? 'Volume increased vs previous session' : trend === 'negative' ? 'Volume decreased vs previous session' : 'No meaningful comparison' }, [createEl('span', { className: 'snapshot-date', textContent: dateText })]);
        tbody.append(createEl('tr', {}, [dateCell, createEl('td', { textContent: formatSet(sets[0]) }), createEl('td', { textContent: formatSet(sets[1]) }), createEl('td', { textContent: formatSet(sets[2]) })]));
    });
    table.append(tbody); container.append(table);
    return container;
}

function renderPlan() {
    const activeWeeklyPlan = appData.weeklyPlans?.default;
    if (!activeWeeklyPlan) return createEl('div', { className: 'card-empty-state' }, [createEl('p', { textContent: 'Default weekly plan is unavailable.' })]);
    const headerCard = createCard({ header: 'Weekly Plan', cardClass: 'minimal-dashboard-card' }, [
        createEl('div', { className: 'plan-clean-intro' }, [
            createEl('div', {}, [createEl('strong', { textContent: activeWeeklyPlan.name || 'Default Plan' }), createEl('p', { textContent: 'Your normal weekly structure.' })]),
            createButton({ content: '<i class="fas fa-rotate-left"></i> Reset', 'data-action': 'reset-default-plan', className: 'secondary-button' })
        ])
    ]);
    const daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const dayCards = daysOfWeek.map(day => {
        const data = activeWeeklyPlan.plan?.[day] || { exercises: [], name: 'Rest Day' };
        const exerciseList = createEl('div', { className: 'plan-exercise-display-list' });
        if (data.exercises?.length) data.exercises.forEach((ex, index) => exerciseList.append(createEl('div', { className: 'plan-exercise-row' }, [createEl('span', { className: 'plan-exercise-number', textContent: String(index + 1).padStart(2, '0') }), createEl('strong', { textContent: ex.name })])));
        else exerciseList.append(createEl('p', { className: 'plan-rest-text', textContent: 'Rest day' }));
        return createCard({ header: `${day} · ${data.name || 'Rest Day'}`, cardClass: 'minimal-dashboard-card plan-day-card' }, [exerciseList, createEl('div', { className: 'plan-day-actions' }, [createButton({ content: 'Edit', 'data-action': 'open-plan-edit-modal', 'data-day': day, 'data-weekly-plan-id': 'default', className: 'secondary-button' })])]);
    });
    return [headerCard, ...dayCards, renderSavedWorkoutsSection()];
}

function renderSavedWorkoutsSection() {
    const names = Object.keys(appData.customWorkouts || {}).sort();
    const list = createEl('div', { className: 'saved-workouts-list' });
    if (!names.length) list.append(createEl('p', { className: 'muted-copy', textContent: 'No saved workouts yet. Create one to quickly load it into Log.' }));
    names.forEach(name => {
        const workout = appData.customWorkouts[name] || { exercises: [] };
        const safe = name.replace(/\s+/g, '-').toLowerCase();
        list.append(createEl('div', { className: 'saved-workout-row' }, [
            createEl('div', {}, [createEl('strong', { textContent: name }), createEl('span', { textContent: `${workout.exercises?.length || 0} exercises` })]),
            createEl('div', { className: 'saved-workout-actions' }, [
                createButton({ content: 'Load', 'data-action': 'load-custom-workout-to-log', 'data-name': name, className: 'secondary-button' }),
                createButton({ content: 'Edit', 'data-action': 'edit-custom-workout', 'data-name': name, className: 'secondary-button' }),
                createButton({ content: '<i class="fas fa-trash"></i>', 'data-action': 'delete-custom-workout', 'data-name': name, className: 'danger icon-action-button', title: 'Delete' })
            ])
        ]));
    });
    return createCard({ header: 'Saved Workouts', cardClass: 'minimal-dashboard-card saved-workouts-card' }, [list, createButton({ content: '<i class="fas fa-plus"></i> New Saved Workout', 'data-action': 'create-custom-workout', className: 'secondary-button full-width' })]);
}


    // Final initialization call (copied from original source)
    init();
});
