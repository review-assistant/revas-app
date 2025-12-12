import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithAuth, createMockUser, createMockProfile } from './test/test-utils'
import AccountSettings from './AccountSettings'

describe('AccountSettings', () => {
  const mockUser = createMockUser()
  const mockProfile = createMockProfile()
  const mockOnBack = vi.fn()
  const mockUpdateProfile = vi.fn()
  const mockChangePassword = vi.fn()
  const mockDeleteAccount = vi.fn()
  const mockExportData = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Profile Information', () => {
    it('renders profile form with user data', () => {
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            updateProfile: mockUpdateProfile
          }
        }
      )

      expect(screen.getByLabelText('First Name')).toHaveValue('Test')
      expect(screen.getByLabelText('Last Name')).toHaveValue('User')
      expect(screen.getByLabelText('Email')).toHaveValue('test@example.com')
      expect(screen.getByLabelText('Email')).toBeDisabled()
    })

    it('validates required fields', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            updateProfile: mockUpdateProfile
          }
        }
      )

      // Clear the name fields
      await user.clear(screen.getByLabelText('First Name'))
      await user.clear(screen.getByLabelText('Last Name'))
      await user.click(screen.getByText('Save Changes'))

      await waitFor(() => {
        expect(screen.getByText('Please enter both first and last name')).toBeInTheDocument()
      })
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })

    it('updates profile with new data', async () => {
      const user = userEvent.setup()
      mockUpdateProfile.mockResolvedValue({ error: null })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            updateProfile: mockUpdateProfile
          }
        }
      )

      await user.clear(screen.getByLabelText('First Name'))
      await user.type(screen.getByLabelText('First Name'), 'Updated')
      await user.click(screen.getByText('Save Changes'))

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith('Updated', 'User')
      })

      await waitFor(() => {
        expect(screen.getByText('Profile updated successfully!')).toBeInTheDocument()
      })
    })

    it('displays error on profile update failure', async () => {
      const user = userEvent.setup()
      mockUpdateProfile.mockResolvedValue({
        error: { message: 'Update failed' }
      })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            updateProfile: mockUpdateProfile
          }
        }
      )

      await user.type(screen.getByLabelText('First Name'), 'Updated')
      await user.click(screen.getByText('Save Changes'))

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument()
      })
    })
  })

  describe('Change Password', () => {
    it('validates all password fields are filled', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            changePassword: mockChangePassword
          }
        }
      )

      await user.click(screen.getByText('Change Password'))

      await waitFor(() => {
        expect(screen.getByText('Please fill in all password fields')).toBeInTheDocument()
      })
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('validates new password length', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            changePassword: mockChangePassword
          }
        }
      )

      await user.type(screen.getByLabelText('Current Password'), 'oldpass123')
      await user.type(screen.getByLabelText('New Password'), '12345')
      await user.type(screen.getByLabelText('Confirm New Password'), '12345')
      await user.click(screen.getByText('Change Password'))

      await waitFor(() => {
        expect(screen.getByText('New password must be at least 6 characters')).toBeInTheDocument()
      })
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('validates passwords match', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            changePassword: mockChangePassword
          }
        }
      )

      await user.type(screen.getByLabelText('Current Password'), 'oldpass123')
      await user.type(screen.getByLabelText('New Password'), 'newpass123')
      await user.type(screen.getByLabelText('Confirm New Password'), 'different123')
      await user.click(screen.getByText('Change Password'))

      await waitFor(() => {
        expect(screen.getByText('New passwords do not match')).toBeInTheDocument()
      })
      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('changes password successfully', async () => {
      const user = userEvent.setup()
      mockChangePassword.mockResolvedValue({ error: null })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            changePassword: mockChangePassword
          }
        }
      )

      await user.type(screen.getByLabelText('Current Password'), 'oldpass123')
      await user.type(screen.getByLabelText('New Password'), 'newpass123')
      await user.type(screen.getByLabelText('Confirm New Password'), 'newpass123')
      await user.click(screen.getByText('Change Password'))

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith('oldpass123', 'newpass123')
      })

      await waitFor(() => {
        expect(screen.getByText('Password changed successfully!')).toBeInTheDocument()
      })
    })

    it('displays error for incorrect current password', async () => {
      const user = userEvent.setup()
      mockChangePassword.mockResolvedValue({
        error: { message: 'Current password is incorrect' }
      })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            changePassword: mockChangePassword
          }
        }
      )

      await user.type(screen.getByLabelText('Current Password'), 'wrongpass')
      await user.type(screen.getByLabelText('New Password'), 'newpass123')
      await user.type(screen.getByLabelText('Confirm New Password'), 'newpass123')
      await user.click(screen.getByText('Change Password'))

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument()
      })
    })
  })

  describe('Data Export', () => {
    it('exports user data', async () => {
      const user = userEvent.setup()
      mockExportData.mockResolvedValue({ error: null })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            exportData: mockExportData
          }
        }
      )

      await user.click(screen.getByText('Download My Data'))

      await waitFor(() => {
        expect(mockExportData).toHaveBeenCalled()
      })
    })
  })

  describe('Account Deletion', () => {
    it('opens delete confirmation modal', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            deleteAccount: mockDeleteAccount
          }
        }
      )

      await user.click(screen.getByText('Delete My Account'))

      expect(screen.getByText('Delete Account')).toBeInTheDocument()
      expect(screen.getByText(/Type.*DELETE.*to confirm/i)).toBeInTheDocument()
    })

    it('validates DELETE confirmation text', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            deleteAccount: mockDeleteAccount
          }
        }
      )

      await user.click(screen.getByText('Delete My Account'))

      const deleteButton = screen.getAllByText('Delete Account')[1] // Second one in modal
      expect(deleteButton).toBeDisabled()

      // Type wrong text
      await user.type(screen.getByPlaceholderText('Type DELETE'), 'WRONG')
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.getByText('Please type DELETE to confirm')).toBeInTheDocument()
      })
      expect(mockDeleteAccount).not.toHaveBeenCalled()
    })

    it('deletes account when DELETE is typed', async () => {
      const user = userEvent.setup()
      mockDeleteAccount.mockResolvedValue({ error: null })

      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            deleteAccount: mockDeleteAccount
          }
        }
      )

      await user.click(screen.getByText('Delete My Account'))
      await user.type(screen.getByPlaceholderText('Type DELETE'), 'DELETE')

      const deleteButton = screen.getAllByText('Delete Account')[1]
      await user.click(deleteButton)

      await waitFor(() => {
        expect(mockDeleteAccount).toHaveBeenCalled()
      })
    })

    it('closes modal on cancel', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile,
            deleteAccount: mockDeleteAccount
          }
        }
      )

      await user.click(screen.getByText('Delete My Account'))
      expect(screen.getByText(/Type.*DELETE/i)).toBeInTheDocument()

      await user.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(screen.queryByText(/Type.*DELETE/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Navigation', () => {
    it('calls onBack when back button is clicked', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <AccountSettings onBack={mockOnBack} />,
        {
          providerProps: {
            user: mockUser,
            profile: mockProfile
          }
        }
      )

      await user.click(screen.getByText('← Back to App'))

      expect(mockOnBack).toHaveBeenCalled()
    })
  })
})
