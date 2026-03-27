import { payrollWorker } from './payrollWorker.js';
import { notificationWorker } from './notificationWorker.js';
import logger from '../utils/logger.js';

export const startWorkers = () => {
  logger.info('Starting BullMQ workers...');

<<<<<<< report-builder
  // Workers are started when imported
  if (payrollWorker.isRunning()) {
    logger.info('Payroll worker is running');
  }
=======
    // Workers are started when imported
    if (payrollWorker.isRunning()) {
        logger.info('Payroll worker is running');
    }
    
    logger.info('Notification worker initialized');
>>>>>>> main
};
