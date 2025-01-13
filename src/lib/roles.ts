import { supabase } from './supabaseClient';

export interface Role {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  assigned_at: string;
  assigned_by: string;
}

// Initialize roles in Supabase
export async function initializeRoles() {
  try {
    console.log('Checking roles initialization...');
    
    // Check if roles exist
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('name');

    if (rolesError) {
      console.error('Error checking roles:', rolesError);
      return;
    }

    // If roles exist, we're done
    if (roles && roles.length > 0) {
      console.log('Roles already initialized');
      return;
    }

    console.log('No roles found, skipping initialization (handled by migrations)');
  } catch (error) {
    console.error('Failed to initialize roles:', error);
  }
}

// Get user's roles
export async function getUserRoles(userId: string): Promise<Role[]> {
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select(`
      role_id,
      roles (
        id,
        name,
        description,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user roles:', error);
    throw error;
  }

  return roles?.map(r => r.roles) || [];
}

// Assign a role to a user
export async function assignRole(userId: string, roleName: string, assignedBy: string): Promise<void> {
  try {
    // First get the role ID
    const { data: roles, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single();

    if (roleError || !roles) {
      console.error('Error finding role:', roleError);
      throw new Error(`Role ${roleName} not found`);
    }

    // Assign the role to the user
    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_id: roles.id,
        assigned_by: assignedBy
      });

    if (error) {
      // If the error is about unique violation, the role is already assigned
      if (error.code === '23505') {
        console.log('Role already assigned:', { userId, roleName });
        return;
      }
      console.error('Error assigning role:', error);
      throw error;
    }

    console.log('Role assigned successfully:', { userId, roleName });
  } catch (error) {
    console.error('Error in assignRole:', error);
    throw error;
  }
}

// Remove a role from a user
export async function removeRole(userId: string, roleName: string): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleName);

  if (error) {
    console.error('Error removing role:', error);
    throw error;
  }
}

// Check if a user has a specific permission
export async function checkPermission(userId: string, permissionName: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('check_permission', {
      user_id: userId,
      permission_name: permissionName
    });

  if (error) {
    console.error('Error checking permission:', error);
    throw error;
  }

  return data || false;
}

// Check if a user has a specific role
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .eq('role_id', roleName)
    .single();

  if (error && error.code !== 'PGRST116') { // Ignore not found error
    console.error('Error checking role:', error);
    throw error;
  }

  return !!data;
}

// Get the highest role for a user
export async function getHighestRole(userId: string): Promise<Role | null> {
  const roles = await getUserRoles(userId);
  if (roles.length === 0) return null;

  const roleHierarchy = ['Administrator', 'Staff', 'Premium', 'User'];
  
  // Find the highest role based on hierarchy
  for (const roleName of roleHierarchy) {
    const role = roles.find(r => r.name === roleName);
    if (role) return role;
  }
  
  return roles[0];
}

// Get all roles
export async function getAllRoles(): Promise<Role[]> {
  const { data: roles, error } = await supabase
    .from('roles')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }

  return roles || [];
}