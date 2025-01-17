import React from 'react';
import { registerUser, loginUser } from '../lib/firebase';

interface AuthFormsProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

interface RegistrationData {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  dob: string;
}

export function AuthForms({ onSuccess, onError }: AuthFormsProps) {
  const [isLogin, setIsLogin] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState<RegistrationData>({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    dob: ''
  });
  const [errorMessage, setErrorMessage] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear password error when either password field changes
    if (name === 'password' || name === 'confirmPassword') {
      setPasswordError('');
    }
    // Clear error message when user starts typing
    setErrorMessage('');
  };

  const validateForm = () => {
    if (!isLogin) {
      // Registration validation
      if (formData.password !== formData.confirmPassword) {
        setPasswordError('Passwords do not match');
        return false;
      }
      
      if (formData.password.length < 8) {
        setPasswordError('Password must be at least 8 characters long');
        return false;
      }
      
      // Validate username
      if (formData.username.length < 3) {
        onError('Username must be at least 3 characters long');
        return false;
      }
      
      // Validate DOB
      const dobDate = new Date(formData.dob);
      const today = new Date();
      const age = today.getFullYear() - dobDate.getFullYear();
      if (age < 13) {
        onError('You must be at least 13 years old to register');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (isLogin) {
        try {
          setErrorMessage('');
          await loginUser(formData.email, formData.password, rememberMe);
        } catch (error) {
          // Handle specific login errors
          if (error instanceof Error) {
            setIsSubmitting(false);
            setErrorMessage(error.message);
          } else {
            setIsSubmitting(false);
            setErrorMessage('Failed to login. Please check your credentials.');
          }
          return;
        }
      } else {
        await registerUser(formData.email, formData.password, formData.username, formData.dob);
      }
      onSuccess();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setIsSubmitting(false);
      setErrorMessage(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="flex justify-center mb-8">
        <img 
          src="https://imgur.com/1YoQljt.png" 
          alt="Discord Bot Builder Logo" 
          width="128" 
          height="98"
          className="rounded-lg shadow-lg bg-[#36393F] p-2"
        />
      </div>
      <div className="bg-[#36393F] rounded-lg shadow-lg p-8 border border-[#202225]">
        <h2 className="text-2xl font-bold text-center mb-6">
          {isLogin ? 'Login' : 'Create Account'}
        </h2>
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
              required
            />
          </div>
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                  required
                  minLength={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Date of Birth
                </label>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
              required
              minLength={8}
            />
          </div>
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                required
                minLength={8}
              />
              {passwordError && (
                <p className="mt-1 text-sm text-red-400">
                  {passwordError}
                </p>
              )}
            </div>
          )}
          {isLogin && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#7289DA] focus:ring-[#7289DA]"
              />
              <label htmlFor="remember" className="ml-2 block text-sm">
                Remember me
              </label>
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2 px-4 rounded-md bg-[#7289DA] hover:bg-[#677BC4] transition-colors ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSubmitting ? 'Please wait...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-[#7289DA] hover:underline text-sm transition-colors duration-200"
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
          </button>
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-gray-400">
        <p>By continuing, you agree to our</p>
        <div className="space-x-2">
          <a href="#" className="text-[#7289DA] hover:underline">Terms of Service</a>
          <span>and</span>
          <a href="#" className="text-[#7289DA] hover:underline">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}