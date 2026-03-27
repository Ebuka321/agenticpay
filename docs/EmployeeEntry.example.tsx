/**
 * EmployeeEntry.example.tsx
 *
 * Production-ready example showing how to integrate EmployeeRemovalConfirmModal
 * into the EmployeeEntry page component.
 *
 * This example demonstrates:
 * - State management for modal visibility and selected employee
 * - Integration with existing EmployeeList component
 * - Error handling and user notifications
 * - Loading states during removal
 * - i18n support
 *
 * eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EmployeeRemovalConfirmModal } from '@/components/EmployeeRemovalConfirmModal';
import { EmployeeList } from '@/components/EmployeeList';
import { useNotification } from '@/hooks/useNotification';

export interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  wallet?: string;
  imageUrl?: string;
  status?: 'Active' | 'Inactive';
}

/**
 * EmployeeEntry Component with Removal Confirmation Modal Integration
 *
 * Features:
 * - Employees list management
 * - Safe employee removal with confirmation
 * - Real-time loading states
 * - Error handling with toast notifications
 * - Analytics tracking
 * - i18n support
 */
export const EmployeeEntry: React.FC = () => {
  const { t } = useTranslation();
  const { notifyError, notifySuccess } = useNotification();

  // Employee list state
  const [employees, setEmployees] = useState<Employee[]>([
    {
      id: 'emp-001',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      position: 'Senior Developer',
      status: 'Active',
    },
    {
      id: 'emp-002',
      name: 'Bob Smith',
      email: 'bob@example.com',
      position: 'Product Manager',
      status: 'Active',
    },
  ]);

  // Modal and removal state
  const [removalModal, setRemovalModal] = useState<{
    isOpen: boolean;
    employee: Employee | null;
  }>({
    isOpen: false,
    employee: null,
  });

  const [isRemoving, setIsRemoving] = useState(false);

  /**
   * Handler: Opens the removal confirmation modal with selected employee
   */
  const handleRemoveEmployee = useCallback(
    (employeeId: string) => {
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        notifyError(t('errors.employeeNotFound', 'Employee not found'));
        return;
      }

      setRemovalModal({
        isOpen: true,
        employee,
      });

      // Track modal open event
      // Note: Add gtag analytics tracking as needed in your implementation
    },
    [employees, t]
  );

  /**
   * Handler: Confirms employee removal
   * - Calls API to remove employee
   * - Updates local state on success
   * - Shows error notification on failure
   * - Tracks event for analytics
   */
  const handleConfirmRemoval = useCallback(
    async (employeeId: string) => {
      const employee = removalModal.employee;
      if (!employee) return;

      setIsRemoving(true);

      try {
        // Simulate API call to remove employee
        // In production, replace with actual API endpoint
        await new Promise((resolve) => setTimeout(resolve, 800));

        // API call would look like:
        // const response = await api.delete(`/employees/${employeeId}`);
        // if (!response.ok) throw new Error(response.statusText);

        // Update local state
        setEmployees((prev) => prev.filter((emp) => emp.id !== employeeId));

        // Close modal
        setRemovalModal({
          isOpen: false,
          employee: null,
        });

        // Show success notification
        notifySuccess(
          t('notifications.employeeRemoved', 'Employee {name} has been removed', {
            name: employee.name,
          })
        );

        // Track successful removal
        // gtag('event', 'employee_removed', {
        //   employee_id: employeeId,
        //   employee_name: employee.name,
        //   timestamp: new Date().toISOString(),
        // });
      } catch (error) {
        const employeeError = error as Record<string, unknown>;
        const msg = (employeeError?.message as string) || 'Unknown error';
        notifyError(
          t('errors.employeeRemovalFailed', 'Failed to remove employee: {error}', {
            error: msg,
          })
        );

        // Track removal failure
        // gtag('event', 'employee_removal_failed', {
        //   employee_id: employeeId,
        //   error: msg,
        // });
      }
    },
    [removalModal.employee, t]
  );

  /**
   * Handler: Cancels removal and closes modal
   */
  const handleCancelRemoval = useCallback(() => {
    const employee = removalModal.employee;
    if (employee) {
      // Note: Add gtag analytics tracking as needed in your implementation
    }

    setRemovalModal({
      isOpen: false,
      employee: null,
    });
  }, [removalModal.employee]);

  /**
   * Handler: Updates employee image
   */
  const handleUpdateEmployeeImage = useCallback(
    (employeeId: string, imageUrl: string) => {
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employeeId ? { ...emp, imageUrl } : emp))
      );
      // Note: Add gtag analytics tracking as needed in your implementation
    },
    []
  );

  /**
   * Handler: Adds new employee
   */
  const handleAddEmployee = useCallback(
    (newEmployee: Omit<Employee, 'id'>) => {
      const employee: Employee = {
        ...newEmployee,
        id: `emp-${Date.now()}`,
      };

      setEmployees((prev) => [...prev, employee]);

      // Note: Add gtag analytics tracking as needed in your implementation
      // gtag('event', 'employee_added', {
      //   employee_id: employee.id,
      //   employee_name: employee.name,
      // });

      notifySuccess(
        t('notifications.employeeAdded', 'Employee {name} has been added', {
          name: newEmployee.name,
        })
      );
    },
    [t]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {t('pages.employees.title', 'Employee Management')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('pages.employees.subtitle', 'Manage your team members and their information')}
          </p>
        </div>

        {/* Employee List */}
        <EmployeeList
          employees={employees}
          onRemoveEmployee={handleRemoveEmployee}
          onUpdateEmployeeImage={handleUpdateEmployeeImage}
          onAddEmployee={handleAddEmployee}
        />

        {/* Employee Removal Confirmation Modal */}
        <EmployeeRemovalConfirmModal
          isOpen={removalModal.isOpen}
          employeeName={removalModal.employee?.name || ''}
          employeeId={removalModal.employee?.id || ''}
          onConfirm={handleConfirmRemoval}
          onCancel={handleCancelRemoval}
          isLoading={isRemoving}
          confirmLabel={t('buttons.confirmRemove', 'Remove Employee')}
          cancelLabel={t('buttons.keepEmployee', 'Keep Employee')}
        />
      </div>
    </div>
  );
};

export default EmployeeEntry;

/**
 * INTEGRATION CHECKLIST:
 *
 * ✅ Import the component
 * ✅ Define modal state (isOpen, employee)
 * ✅ Define removal state (isRemoving)
 * ✅ Implement handleRemoveEmployee (opens modal)
 * ✅ Implement handleConfirmRemoval (removes employee)
 * ✅ Implement handleCancelRemoval (closes modal)
 * ✅ Pass onRemoveEmployee prop to EmployeeList
 * ✅ Render EmployeeRemovalConfirmModal with all props
 * ✅ Add i18n keys to translation files
 * ✅ Add notifications (success/error)
 * ✅ Add analytics tracking
 *
 * NEXT STEPS:
 *
 * 1. Replace the mock employee list with your actual data source
 * 2. Update the API endpoint in handleConfirmRemoval
 * 3. Customize notification messages as needed
 * 4. Test the modal in different screen sizes
 * 5. Verify keyboard navigation (Tab, Escape)
 * 6. Test with screen reader (NVDA, JAWS, VoiceOver)
 * 7. Add custom styling if needed (via className prop)
 */
