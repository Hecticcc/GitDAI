import React from 'react';
import { Settings, BarChart2, Code, Clock, Zap, Bot, Shield, Crown, Lock } from 'lucide-react';
import { UserData } from '../lib/firebase';
import { updateUserPassword } from '../lib/firebase';

interface UserDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  userData: UserData;
  codeHistory: { code: string; timestamp: Date }[];
}

interface StatCard {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description: string;
  color: string;
}

export function UserDashboard({ isOpen, onClose, userData, codeHistory }: UserDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'settings'>('overview');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState('');
  const [passwordSuccess, setPasswordSuccess] = React.useState('');
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    try {
      setIsChangingPassword(true);
      await updateUserPassword(currentPassword, newPassword);
      setPasswordSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!isOpen) return null;

  // Calculate statistics
  const totalCodeGenerated = codeHistory.reduce((acc, curr) => acc + curr.code.length, 0);
  const averageCodeLength = Math.round(totalCodeGenerated / Math.max(codeHistory.length, 1));
  const lastGeneratedTime = codeHistory.length > 0 
    ? codeHistory[codeHistory.length - 1].timestamp.toLocaleString()
    : 'Never';

  const stats: StatCard[] = [
    {
      title: 'Total Tokens',
      value: userData.tokens,
      icon: Zap,
      description: 'Available tokens for AI generation',
      color: 'bg-yellow-500/10 text-yellow-400'
    },
    {
      title: 'Code Generations',
      value: codeHistory.length,
      icon: Code,
      description: 'Total number of code generations',
      color: 'bg-emerald-500/10 text-emerald-400'
    },
    {
      title: 'Active Servers',
      value: userData.servers?.length || 0,
      icon: Bot,
      description: 'Currently running bot servers',
      color: 'bg-blue-500/10 text-blue-400'
    },
    {
      title: 'Account Type',
      value: userData.role.charAt(0).toUpperCase() + userData.role.slice(1),
      icon: Crown,
      description: 'Your current subscription level',
      color: 'bg-purple-500/10 text-purple-400'
    }
  ];

  const detailedStats = [
    {
      title: 'Total Lines Generated',
      value: codeHistory.reduce((acc, curr) => acc + curr.code.split('\n').length, 0),
      icon: BarChart2
    },
    {
      title: 'Average Code Length',
      value: `${averageCodeLength} characters`,
      icon: Code
    },
    {
      title: 'Last Generated',
      value: lastGeneratedTime,
      icon: Clock
    },
    {
      title: 'Account Created',
      value: userData.createdAt.toDate().toLocaleDateString(),
      icon: Shield
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#36393F] rounded-lg w-full max-w-4xl mx-4 h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">User Dashboard</h2>
            <div className="flex items-center space-x-2 bg-[#2F3136] rounded-lg p-1">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-[#7289DA] text-white'
                    : 'hover:bg-[#40444B]'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-[#7289DA] text-white'
                    : 'hover:bg-[#40444B]'
                }`}
              >
                Settings
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="bg-[#2F3136] rounded-lg p-4 transition-transform hover:scale-[1.02]"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-gray-400">{stat.title}</div>
                        <div className="text-2xl font-semibold mt-1">{stat.value}</div>
                      </div>
                      <div className={`p-2 rounded-lg ${stat.color}`}>
                        <stat.icon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {stat.description}
                    </div>
                  </div>
                ))}
              </div>

              {/* Detailed Stats */}
              <div className="bg-[#2F3136] rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Detailed Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {detailedStats.map((stat, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-[#40444B]">
                        <stat.icon className="w-5 h-5 text-[#7289DA]" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-400">{stat.title}</div>
                        <div className="font-medium">{stat.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-[#2F3136] rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Recent Activity</h3>
                <div className="space-y-4">
                  {codeHistory.slice(-5).reverse().map((entry, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-[#40444B]">
                        <Code className="w-4 h-4 text-[#7289DA]" />
                      </div>
                      <div>
                        <div className="text-sm">Generated code</div>
                        <div className="text-xs text-gray-400">
                          {entry.timestamp.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-[#2F3136] rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Account Settings</h3>
                <div className="space-y-4">
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Change Password</div>
                        <div className="text-sm text-gray-400">Update your account password</div>
                      </div>
                      <div className="p-2 rounded-lg bg-[#40444B]">
                        <Lock className="w-5 h-5 text-[#7289DA]" />
                      </div>
                    </div>
                    
                    {passwordError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {passwordError}
                      </div>
                    )}
                    
                    {passwordSuccess && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
                        {passwordSuccess}
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                        required
                        minLength={8}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className={`w-full px-4 py-2 rounded-md transition-colors ${
                        isChangingPassword
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-[#7289DA] hover:bg-[#677BC4]'
                      }`}
                    >
                      {isChangingPassword ? 'Updating Password...' : 'Update Password'}
                    </button>
                  </form>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <input
                      type="email"
                      value={userData.email}
                      disabled
                      className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA] disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Username</label>
                    <input
                      type="text"
                      value={userData.username}
                      disabled
                      className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA] disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Account Type</label>
                    <div className="flex items-center space-x-2">
                      <div className="px-3 py-1.5 rounded-md bg-[#40444B] text-sm">
                        {userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}
                      </div>
                      {userData.role === 'user' && (
                        <button className="text-sm text-[#7289DA] hover:underline">
                          Upgrade to Premium
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#2F3136] rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Preferences</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Enhanced AI</div>
                      <div className="text-sm text-gray-400">Use GPT-4 for better code generation</div>
                    </div>
                    <button className="px-3 py-1.5 rounded-md bg-[#40444B] text-sm hover:bg-[#4f535a] transition-colors">
                      Configure
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Code History</div>
                      <div className="text-sm text-gray-400">Manage your generated code history</div>
                    </div>
                    <button className="px-3 py-1.5 rounded-md bg-[#40444B] text-sm hover:bg-[#4f535a] transition-colors">
                      View History
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#2F3136] rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Danger Zone</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-red-400">Delete Account</div>
                      <div className="text-sm text-gray-400">Permanently delete your account and all data</div>
                    </div>
                    <button className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}