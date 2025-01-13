import { getFirestore, doc, collection, addDoc, updateDoc, deleteDoc, query, where, getDocs, Timestamp } from '@firebase/firestore';
import { debugLogger } from './debug';
import { getUserRoles } from './roles';

export interface BotProject {
  id: string;
  userId: string;
  name: string;
  description: string;
  code: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const db = getFirestore();

// Get max projects based on user role
async function getMaxProjects(userId: string): Promise<number> {
  const roles = await getUserRoles(userId);
  
  if (roles.includes('administrator')) return 50;
  if (roles.includes('staff')) return 50;
  if (roles.includes('premium')) return 20;
  return 3; // Default user limit
}

// Create a new bot project
export async function createProject(userId: string, project: Omit<BotProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // Check project limit
    const currentProjects = await getUserProjects(userId);
    const maxProjects = await getMaxProjects(userId);
    
    if (currentProjects.length >= maxProjects) {
      throw new Error(`You have reached your limit of ${maxProjects} projects. Upgrade to Premium for more!`);
    }

    const projectsRef = collection(db, 'bot_projects');
    const docRef = await addDoc(projectsRef, {
      ...project,
      userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    debugLogger.info('Project created', { projectId: docRef.id, userId }, 'projects');
    return docRef.id;
  } catch (error) {
    debugLogger.error('Error creating project', error, 'projects');
    throw error;
  }
}

// Get all projects for a user
export async function getUserProjects(userId: string): Promise<BotProject[]> {
  try {
    const projectsRef = collection(db, 'bot_projects');
    const q = query(projectsRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as BotProject));
  } catch (error) {
    debugLogger.error('Error fetching user projects', error, 'projects');
    throw error;
  }
}

// Get a single project
export async function getProject(projectId: string): Promise<BotProject | null> {
  try {
    const projectRef = doc(db, 'bot_projects', projectId);
    const projectDoc = await projectRef.get();
    
    if (!projectDoc.exists()) return null;
    
    return {
      id: projectDoc.id,
      ...projectDoc.data()
    } as BotProject;
  } catch (error) {
    debugLogger.error('Error fetching project', error, 'projects');
    throw error;
  }
}

// Update a project
export async function updateProject(projectId: string, updates: Partial<BotProject>): Promise<void> {
  try {
    const projectRef = doc(db, 'bot_projects', projectId);
    await updateDoc(projectRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
    
    debugLogger.info('Project updated', { projectId, updates }, 'projects');
  } catch (error) {
    debugLogger.error('Error updating project', error, 'projects');
    throw error;
  }
}

// Delete a project
export async function deleteProject(projectId: string): Promise<void> {
  try {
    const projectRef = doc(db, 'bot_projects', projectId);
    await deleteDoc(projectRef);
    
    debugLogger.info('Project deleted', { projectId }, 'projects');
  } catch (error) {
    debugLogger.error('Error deleting project', error, 'projects');
    throw error;
  }
}