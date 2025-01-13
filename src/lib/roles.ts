import { supabase } from './supabaseClient';

export interface Role {
  id: string;
  name: string;
  description: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string;
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select(`
      role_id,
      roles (
        id,
        name,
        description
      )
    `)
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user roles:', error);
    throw error;
  }

  return data.map(item => item.roles);
}

export async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select(`
      permission_id,
      permissions (
        id,
        name,
        description,
        resource,
        action
      )
    `)
    .eq('role_id', roleId);

  if (error) {
    console.error('Error fetching role permissions:', error);
    throw error;
  }

  return data.map(item => item.permissions);
}

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

  return data;
}

export async function assignRole(userId: string, roleName: string, assignedBy: string): Promise<void> {
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .single();

  if (roleError) {
    console.error('Error finding role:', roleError);
    throw roleError;
  }

  const { error } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role_id: role.id,
      assigned_by: assignedBy
    });

  if (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}

export async function removeRole(userId: string, roleName: string): Promise<void> {
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .single();

  if (roleError) {
    console.error('Error finding role:', roleError);
    throw roleError;
  }

  const { error } = await supabase
    .from('user_roles')
    .delete()
    .match({ user_id: userId, role_id: role.id });

  if (error) {
    console.error('Error removing role:', error);
    throw error;
  }
}

export async function getAllRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }

  return data;
}

export async function getAllPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching permissions:', error);
    throw error;
  }

  return data;
}

// Helper function to check if a user has a specific role
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select(`
      roles!inner (
        name
      )
    `)
    .eq('user_id', userId)
    .eq('roles.name', roleName)
    .maybeSingle();

  if (error) {
    console.error('Error checking role:', error);
    throw error;
  }

  return !!data;
}

// Helper function to get the highest role for a user
export async function getHighestRole(userId: string): Promise<Role | null> {
  const roleHierarchy = ['Administrator', 'Staff', 'Premium', 'User'];
  
  const { data, error } = await supabase
    .from('user_roles')
    .select(`
      roles (
        id,
        name,
        description
      )
    `)
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user roles:', error);
    throw error;
  }

  if (!data || data.length === 0) return null;

  const roles = data.map(item => item.roles);
  
  // Find the highest role based on hierarchy
  for (const roleName of roleHierarchy) {
    const role = roles.find(r => r.name === roleName);
    if (role) return role;
  }

  return roles[0]; // Return first role if none match hierarchy
}