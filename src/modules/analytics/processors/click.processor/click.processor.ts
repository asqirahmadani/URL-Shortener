import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AnalyticsService } from '../../analytics.service';
import { ClickEventDto } from '../../dto/click-event.dto';

/* 
Click Processor - BullMQ worker for click events process
*/
@Processor('clicks')
export class ClickProcessor extends WorkerHost {
  private readonly logger = new Logger(ClickProcessor.name);

  constructor(private readonly analyticsService: AnalyticsService) {
    super();
  }

  /* 
  Main process method - handle all jobs from 'clicks' queue
  */
  async process(job: Job<ClickEventDto, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'record-click':
        return this.handleRecordClick(job);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  /* 
  Process click recording job
  */
  private async handleRecordClick(job: Job<ClickEventDto>): Promise<void> {
    const { data } = job;

    this.logger.debug(`Processing click job ${job.id} for URL ${data.urlId}`);

    try {
      await this.analyticsService.processClickEvent(data);
      this.logger.log(`Successfully processed click job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to process click job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /* 
  Handle job completion
  */
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Click job ${job.id} completed`);
  }

  /* 
  Handle job failure
  */
  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    if (job) {
      this.logger.error(
        `Click job ${job.id} failed after ${job.attemptsMade} attemps: ${error.message}`,
      );
    } else {
      this.logger.error(`Job failed: ${error.message}`, error.stack);
    }
  }
}
