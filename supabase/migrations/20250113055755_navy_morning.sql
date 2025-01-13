/*
  # Role System Implementation

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `description` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `user_roles`
      - `user_id` (uuid, references users)
      - `role_id` (uuid, references roles)
      - `assigned_at` (timestamp)
      - `assigned_by` (uuid, references users)
      
    - `permissions`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `description` (text)
      - `resource` (text)
      - `action` (text)
      - `created_at` (timestamp)
      
    - `role_permissions`
      - `role_id` (uuid, references roles)
      - `permission_id` (uuid, references permissions)
      - `granted_at` (timestamp)
      - `granted_by` (uuid, references users)

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access
    - Ensure hierarchical permission checks

  3. Default Data
    - Create default roles (User, Premium, Staff, Administrator)
    - Add basic permissions
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  role_id uuid REFERENCES roles ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  resource text NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid REFERENCES roles ON DELETE CASCADE,
  permission_id uuid REFERENCES permissions ON DELETE CASCADE,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES auth.users ON DELETE SET NULL,
  PRIMARY KEY (role_id, permission_id)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Roles table policies
CREATE POLICY "Roles are viewable by all authenticated users"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only administrators can manage roles"
  ON roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'Administrator'
    )
  );

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff and administrators can view all user roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('Staff', 'Administrator')
    )
  );

CREATE POLICY "Only administrators can manage user roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'Administrator'
    )
  );

-- Permissions policies
CREATE POLICY "Permissions are viewable by all authenticated users"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only administrators can manage permissions"
  ON permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'Administrator'
    )
  );

-- Role permissions policies
CREATE POLICY "Role permissions are viewable by all authenticated users"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only administrators can manage role permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'Administrator'
    )
  );

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('User', 'Default role for all registered users'),
  ('Premium', 'Premium users with additional features'),
  ('Staff', 'Staff members with moderation capabilities'),
  ('Administrator', 'Full system access and management')
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, description, resource, action) VALUES
  ('view_bots', 'View Discord bots', 'bots', 'view'),
  ('create_bots', 'Create new Discord bots', 'bots', 'create'),
  ('edit_bots', 'Edit Discord bots', 'bots', 'edit'),
  ('delete_bots', 'Delete Discord bots', 'bots', 'delete'),
  ('manage_users', 'Manage user accounts', 'users', 'manage'),
  ('view_analytics', 'View system analytics', 'analytics', 'view'),
  ('manage_roles', 'Manage user roles', 'roles', 'manage'),
  ('manage_permissions', 'Manage role permissions', 'permissions', 'manage')
ON CONFLICT (name) DO NOTHING;

-- Assign default permissions to roles
WITH role_names AS (
  SELECT id, name FROM roles
), permission_ids AS (
  SELECT id, name FROM permissions
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_names r
CROSS JOIN permission_ids p
WHERE 
  (r.name = 'User' AND p.name IN ('view_bots', 'create_bots')) OR
  (r.name = 'Premium' AND p.name IN ('view_bots', 'create_bots', 'edit_bots', 'delete_bots')) OR
  (r.name = 'Staff' AND p.name IN ('view_bots', 'create_bots', 'edit_bots', 'delete_bots', 'manage_users', 'view_analytics')) OR
  (r.name = 'Administrator' AND p.name IN ('view_bots', 'create_bots', 'edit_bots', 'delete_bots', 'manage_users', 'view_analytics', 'manage_roles', 'manage_permissions'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION check_permission(user_id uuid, permission_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = check_permission.user_id
    AND p.name = check_permission.permission_name
  );
END;
$$;