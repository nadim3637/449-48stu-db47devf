
import { 
    db, 
    rtdb, 
    saveUserToLive, 
    saveSystemSettings, 
    saveChapterData, 
    saveUniversalAnalysis,
    saveAiInteraction,
    savePublicActivity,
    getApiUsage,
    subscribeToUsers
} from '../firebase';
import { 
    ref, 
    set, 
    get, 
    update, 
    remove, 
    push 
} from "firebase/database";
import { 
    doc, 
    deleteDoc, 
    getDocs, 
    collection,
    query,
    where,
    limitToLast,
    orderBy,
    setDoc
} from "firebase/firestore";
import { User, SystemSettings, WeeklyTest, MCQItem, InboxMessage, SubscriptionHistoryEntry } from '../types';

// --- HELPER: GET ALL USERS (ONCE) ---
const getAllUsers = async (): Promise<User[]> => {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        return querySnapshot.docs.map(doc => doc.data() as User);
    } catch (e) {
        console.error("Error fetching users:", e);
        return [];
    }
};

// --- HELPER: GET SETTINGS (ONCE) ---
const getSettings = async (): Promise<SystemSettings | null> => {
    try {
        const snapshot = await get(ref(rtdb, 'system_settings'));
        if (snapshot.exists()) return snapshot.val();
        return null;
    } catch (e) { return null; }
};

// --- ACTION IMPLEMENTATIONS ---

const deleteUser = async (userId: string) => {
    try {
        await deleteDoc(doc(db, "users", userId));
        await remove(ref(rtdb, `users/${userId}`));
        return `User ${userId} deleted successfully from Firestore and RTDB.`;
    } catch (e: any) {
        throw new Error(`Failed to delete user ${userId}: ${e.message}`);
    }
};

const updateUser = async (userId: string, updates: Partial<User>) => {
    try {
        const userRef = doc(db, "users", userId);
        // We need to fetch current user to ensure we don't overwrite with partial data incorrectly if using saveUserToLive
        // But saveUserToLive handles full object.
        // Let's use getDoc first
        const snapshot = await get(ref(rtdb, `users/${userId}`));
        if (!snapshot.exists()) throw new Error("User not found");
        
        const currentUser = snapshot.val();
        const updatedUser = { ...currentUser, ...updates };
        
        await saveUserToLive(updatedUser);
        return `User ${userId} updated.`;
    } catch (e: any) {
        throw new Error(`Failed to update user: ${e.message}`);
    }
};

const banUser = async (userId: string, reason: string) => {
    return await updateUser(userId, { isLocked: true });
};

const unbanUser = async (userId: string) => {
    return await updateUser(userId, { isLocked: false });
};

const grantSubscription = async (userId: string, plan: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'LIFETIME', level: 'BASIC' | 'ULTRA') => {
    const now = new Date();
    let endDate: Date | null = new Date();
    
    if (plan === 'WEEKLY') endDate.setDate(now.getDate() + 7);
    else if (plan === 'MONTHLY') endDate.setDate(now.getDate() + 30);
    else if (plan === 'YEARLY') endDate.setDate(now.getDate() + 365);
    else endDate = null;

    const historyEntry: SubscriptionHistoryEntry = {
        id: `grant-${Date.now()}`,
        tier: plan,
        level: level,
        startDate: now.toISOString(),
        endDate: endDate ? endDate.toISOString() : 'LIFETIME',
        durationHours: 0,
        price: 0,
        originalPrice: 0,
        isFree: true,
        grantSource: 'ADMIN',
        grantedBy: 'AI_AGENT'
    };

    // Fetch user to append history
    const snapshot = await get(ref(rtdb, `users/${userId}`));
    if (!snapshot.exists()) throw new Error("User not found");
    const user = snapshot.val();
    
    const newHistory = [historyEntry, ...(user.subscriptionHistory || [])];

    return await updateUser(userId, {
        subscriptionTier: plan,
        subscriptionLevel: level,
        subscriptionEndDate: endDate ? endDate.toISOString() : undefined,
        isPremium: true,
        subscriptionHistory: newHistory,
        grantedByAdmin: true
    });
};

const broadcastMessage = async (message: string, type: 'TEXT' | 'GIFT' = 'TEXT', giftValue?: number) => {
    // This is heavy for all users. We might want to just set a global message in settings
    // OR fetch all users and update their inbox.
    // For safety, let's update system settings 'globalMessage' or similar if intended for banner.
    // Or if intended for Inbox, we limit to batch processing.
    // Let's assume the request implies "Send to everyone".
    // We will use 'push' to a 'broadcasts' node if app supports it, but based on types, users have 'inbox'.
    
    // Better approach: Create a System Notice in settings
    const settings = await getSettings();
    if (settings) {
        const newSettings = { ...settings, noticeText: message };
        await saveSystemSettings(newSettings);
        return "Broadcast banner updated successfully.";
    }
    return "Failed to fetch settings.";
};

const sendInboxMessage = async (userId: string, text: string) => {
    const snapshot = await get(ref(rtdb, `users/${userId}`));
    if (!snapshot.exists()) throw new Error("User not found");
    const user = snapshot.val();
    
    const newMsg: InboxMessage = {
        id: `msg-${Date.now()}`,
        text: text,
        date: new Date().toISOString(),
        read: false,
        type: 'TEXT'
    };
    
    const updatedInbox = [newMsg, ...(user.inbox || [])];
    await updateUser(userId, { inbox: updatedInbox });
    return `Message sent to ${user.name}.`;
};

const createWeeklyTest = async (name: string, subject: string, questionCount: number) => {
    // This requires generating questions using AI (Groq) or just creating a placeholder.
    // The prompt says "createTest". We should probably just create the structure.
    // Actual question generation might be handled by the caller or a separate tool.
    // For now, let's create a test entry in settings.
    
    const settings = await getSettings();
    if (!settings) throw new Error("Settings not found");
    
    const newTest: WeeklyTest = {
        id: `test-${Date.now()}`,
        name: name,
        description: `Subject: ${subject}`,
        isActive: true,
        classLevel: '10', // Default
        questions: [], // Empty for now, needs generation
        totalQuestions: questionCount,
        passingScore: 40,
        createdAt: new Date().toISOString(),
        durationMinutes: 60,
        selectedSubjects: [subject]
    };
    
    const updatedTests = [...(settings.weeklyTests || []), newTest];
    await saveSystemSettings({ ...settings, weeklyTests: updatedTests });
    return `Weekly Test "${name}" created (Empty Questions).`;
};

const scanUsers = async (filter: 'ALL' | 'PREMIUM' | 'FREE' | 'INACTIVE') => {
    const users = await getAllUsers();
    let result = users;
    
    if (filter === 'PREMIUM') result = users.filter(u => u.isPremium);
    if (filter === 'FREE') result = users.filter(u => !u.isPremium);
    if (filter === 'INACTIVE') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        result = users.filter(u => !u.lastActiveTime || new Date(u.lastActiveTime) < monthAgo);
    }
    
    return result.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, credits: u.credits, tier: u.subscriptionTier }));
};

const getRecentLogs = async (limit: number = 20) => {
     try {
        const q = query(collection(db, "ai_interactions"), orderBy("timestamp", "desc"), limitToLast(limit));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data());
     } catch (e) { return []; }
};

const updateSystemSettings = async (updates: Partial<SystemSettings>) => {
    try {
        const current = await getSettings();
        if (!current) throw new Error("Settings not found");
        const newSettings = { ...current, ...updates };
        await saveSystemSettings(newSettings);
        return "System Settings updated successfully.";
    } catch (e: any) {
        throw new Error(`Failed to update settings: ${e.message}`);
    }
};

// --- REGISTRY MAP ---
export const ActionRegistry = {
    deleteUser,
    updateUser,
    banUser,
    unbanUser,
    grantSubscription,
    broadcastMessage,
    sendInboxMessage,
    createWeeklyTest,
    scanUsers,
    getRecentLogs,
    updateSystemSettings
};

// --- TOOL DEFINITIONS (JSON SCHEMA) ---
export const adminTools = [
    {
        type: "function",
        function: {
            name: "deleteUser",
            description: "Delete a user permanently from the system.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user to delete" }
                },
                required: ["userId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "updateUser",
            description: "Update user details like credits.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user" },
                    updates: { 
                        type: "object", 
                        description: "JSON object of fields to update (e.g., { credits: 500 })" 
                    }
                },
                required: ["userId", "updates"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "grantSubscription",
            description: "Give a premium subscription to a user.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user" },
                    plan: { type: "string", enum: ["WEEKLY", "MONTHLY", "YEARLY", "LIFETIME"] },
                    level: { type: "string", enum: ["BASIC", "ULTRA"] }
                },
                required: ["userId", "plan", "level"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "banUser",
            description: "Lock/Ban a user account.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user" },
                    reason: { type: "string", description: "Reason for banning" }
                },
                required: ["userId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "unbanUser",
            description: "Unlock/Unban a user account.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user" }
                },
                required: ["userId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "broadcastMessage",
            description: "Set a global notice/banner text for all users.",
            parameters: {
                type: "object",
                properties: {
                    message: { type: "string", description: "The message text to display" }
                },
                required: ["message"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "sendInboxMessage",
            description: "Send a personal message to a specific user's inbox.",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "The ID of the user" },
                    text: { type: "string", description: "The message content" }
                },
                required: ["userId", "text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "createWeeklyTest",
            description: "Create a new Weekly Test (structure only).",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the test" },
                    subject: { type: "string", description: "Subject of the test" },
                    questionCount: { type: "number", description: "Total questions" }
                },
                required: ["name", "subject", "questionCount"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "scanUsers",
            description: "List users based on a filter.",
            parameters: {
                type: "object",
                properties: {
                    filter: { type: "string", enum: ["ALL", "PREMIUM", "FREE", "INACTIVE"] }
                },
                required: ["filter"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "updateSystemSettings",
            description: "Update global system settings (Theme, AI Limits, Maintenance).",
            parameters: {
                type: "object",
                properties: {
                    updates: {
                        type: "object",
                        description: "JSON object of settings to update (e.g. {themeColor: '#000000', maintenanceMode: true, aiLimits: {free: 10}})"
                    }
                },
                required: ["updates"]
            }
        }
    }
];
