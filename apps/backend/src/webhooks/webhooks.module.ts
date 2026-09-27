import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './webhook.entity';
import { WebhookDelivery } from './webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookVerifierService } from '../common/services/webhook-verifier.service';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook, WebhookDelivery])],
  providers: [WebhooksService, WebhookVerifierService],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
