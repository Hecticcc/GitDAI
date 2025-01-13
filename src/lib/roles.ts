import {
  doc, 
  collection,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
  Timestamp 
} from '@firebase/firestore';
import { db } from './firebase';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedAt: Timestamp;
  assignedBy: string;
}

// Default roles and their permissions
const DEFAULT_ROLES = {
  User: {
    description: 'Default role for all registered users',
    permissions: ['view_bots', 'create_bots']
  },
  Premium: {
    description: 'Premium users with additional features',
    permissions: ['view_bots', 'create_bots', 'edit_bots', 'delete_bots']
  },
  Staff: {
    description: 'Staff members with moderation capabilities',
    permissions: ['view_bots', 'create_bots', 'edit_bots', 'delete_bots', 'manage_users', 'view_analytics']
  },
  Administrator: {
    description: 'Full system access and management',
    permissions: ['view_bots', 'create_bots', 'edit_bots', 'delete_bots', 'manage_users', 'view_analytics', 'manage_roles', 'manage_permissions']
  }
};

// Initialize roles in Firestore
export async function initializeRoles() {
  try {
    const rolesCollection = collection(db, 'roles');
    const timestamp = Timestamp.now();

    for (const [name, data] of Object.entries(DEFAULT_ROLES)) {
      const roleRef = doc(rolesCollection, name.toLowerCase());
      await setDoc(roleRef, {
        name,
        description: data.description,
        permissions: data.permissions,
        createdAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });
    }
  } catch (error) {
    console.error('Error initializing roles:', error);
    throw error;
  }
}

// Get user's roles
export async function getUserRoles(userId: string): Promise<Role[]> {
  try {
    const userRolesRef = collection(db, 'user_roles');
    const userRolesQuery = query(userRolesRef, where('userId', '==', userId));
    const userRolesSnapshot = await getDocs(userRolesQuery);
    
    const roles: Role[] = [];
    
    for (const userRole of userRolesSnapshot.docs) {
      const roleRef = doc(db, 'roles', userRole.data().roleId);
      const roleDoc = await getDoc(roleRef);
      
      if (roleDoc.exists()) {
        roles.push({ id: roleDoc.id, ...roleDoc.data() } as Role);
      }
    }
    
    return roles;
  } catch (error) {
    console.error('Error fetching user roles:', error);
    throw error;
  }
}

// Assign a role to a user
export async function assignRole(userId: string, roleName: string, assignedBy: string): Promise<void> {
  try {
    const roleRef = doc(db, 'roles', roleName.toLowerCase());
    const roleDoc = await getDoc(roleRef);
    
    if (!roleDoc.exists()) {
      throw new Error(`Role ${roleName} does not exist`);
    }
    
    const userRoleRef = doc(db, 'user_roles', `${userId}_${roleName.toLowerCase()}`);
    await setDoc(userRoleRef, {
      userId,
      roleId: roleDoc.id,
      assignedAt: Timestamp.now(),
      assignedBy
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}

// Remove a role from a user
export async function removeRole(userId: string, roleName: string): Promise<void> {
  try {
    const userRoleRef = doc(db, 'user_roles', `${userId}_${roleName.toLowerCase()}`);
    await deleteDoc(userRoleRef);
  } catch (error) {
    console.error('Error removing role:', error);
    throw error;
  }
}

// Check if a user has a specific permission
export async function checkPermission(userId: string, permission: string): Promise<boolean> {
  try {
    const roles = await getUserRoles(userId);
    return roles.some(role => role.permissions.includes(permission));
  } catch (error) {
    console.error('Error checking permission:', error);
    throw error;
  }
}

// Check if a user has a specific role
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const userRoleRef = doc(db, 'user_roles', `${userId}_${roleName.toLowerCase()}`);
    const userRoleDoc = await getDoc(userRoleRef);
    return userRoleDoc.exists();
  } catch (error) {
    console.error('Error checking role:', error);
    throw error;
  }
}

// Get the highest role for a user
export async function getHighestRole(userId: string): Promise<Role | null> {
  try {
    const roles = await getUserRoles(userId);
    if (roles.length === 0) return null;

    const roleHierarchy = ['administrator', 'staff', 'premium', 'user'];
    
    // Find the highest role based on hierarchy
    for (const roleName of roleHierarchy) {
      const role = roles.find(r => r.id === roleName);
      if (role) return role;
    }
    
    return roles[0];
  } catch (error) {
    console.error('Error getting highest role:', error);
    throw error;
  }
}

// Get all roles
export async function getAllRoles(): Promise<Role[]> {
  try {
    const rolesRef = collection(db, 'roles');
    const rolesSnapshot = await getDocs(rolesRef);
    return rolesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
}

// Initialize roles when the module is imported
initializeRoles().catch(console.error);