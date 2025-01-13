import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from '@firebase/firestore';
import { debugLogger } from './debug';

export interface Role {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRole {
  userId: string;
  role: string;
  assignedAt: Date;
  assignedBy: string;
}

const db = getFirestore();

// Get user's roles
export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    const userRolesRef = collection(db, 'user_roles');
    const q = query(userRolesRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data().role);
  } catch (error) {
    debugLogger.error('Error fetching user roles', error, 'roles');
    throw error;
  }
}

// Check if a user has a specific role
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const roleDocRef = doc(db, 'user_roles', `${userId}_${roleName}`);
    const roleDoc = await getDoc(roleDocRef);
    return roleDoc.exists();
  } catch (error) {
    debugLogger.error('Error checking role', error, 'roles');
    throw error;
  }
}

// Check if user is admin
export async function isAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, 'administrator');
}

// Check if user is staff
export async function isStaff(userId: string): Promise<boolean> {
  const staffRoles = ['administrator', 'staff'];
  const roles = await getUserRoles(userId);
  return roles.some(role => staffRoles.includes(role.toLowerCase()));
}

// Get the highest role for a user
export async function getHighestRole(userId: string): Promise<string> {
  const roles = await getUserRoles(userId);
  const roleHierarchy = ['administrator', 'staff', 'premium', 'user'];
  
  // Find the highest role based on hierarchy
  for (const roleName of roleHierarchy) {
    if (roles.includes(roleName)) {
      return roleName;
    }
  }
  
  return 'user'; // Default role
}

// Assign a role to a user
export async function assignRole(userId: string, roleName: string, assignedBy: string = 'system'): Promise<void> {
  try {
    const roleDocRef = doc(db, 'user_roles', `${userId}_${roleName}`);
    await setDoc(roleDocRef, {
      userId,
      role: roleName,
      assignedAt: new Date(),
      assignedBy
    });
    
    debugLogger.info('Role assigned', { userId, roleName, assignedBy }, 'roles');
  } catch (error) {
    debugLogger.error('Error assigning role', error, 'roles');
    throw error;
  }
}

// Remove a role from a user
export async function removeRole(userId: string, roleName: string): Promise<void> {
  try {
    const roleDocRef = doc(db, 'user_roles', `${userId}_${roleName}`);
    await roleDocRef.delete();
    
    debugLogger.info('Role removed', { userId, roleName }, 'roles');
  } catch (error) {
    debugLogger.error('Error removing role', error, 'roles');
    throw error;
  }
}