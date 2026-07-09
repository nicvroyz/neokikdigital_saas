import { EventEmitter } from 'events';

export interface ServerHealthMetrics {
  cpu_usage: number;
  ram_total_gb: number;
  ram_used_gb: number;
  disk_total_gb: number;
  disk_used_gb: number;
  docker_status: string;
  mailcow_status: string;
  redis_status: string;
  postgres_status: string;
  response_time_ms: number;
}

export type InfrastructureEvent =
  | {
      type: 'migration:started';
      migrationId: string;
      domain: string;
    }
  | {
      type: 'migration:step';
      migrationId: string;
      step: string;
      status: 'RUNNING' | 'SUCCESS' | 'FAILED';
      message: string;
      percentage: number;
      metadata?: any;
    }
  | {
      type: 'migration:completed';
      migrationId: string;
    }
  | {
      type: 'migration:failed';
      migrationId: string;
      error: string;
    }
  | {
      type: 'server:health_measured';
      metrics: ServerHealthMetrics;
    };

class TypedEventBus {
  private emitter = new EventEmitter();

  emit<K extends InfrastructureEvent['type']>(
    type: K,
    payload: Omit<Extract<InfrastructureEvent, { type: K }>, 'type'>
  ): boolean {
    console.log(`[EVENT BUS] Emitting event: ${type}`, (payload as any).migrationId ? `(ref: ${(payload as any).migrationId})` : '');
    return this.emitter.emit(type, { type, ...payload });
  }

  on<K extends InfrastructureEvent['type']>(
    type: K,
    listener: (payload: Extract<InfrastructureEvent, { type: K }>) => void
  ): this {
    this.emitter.on(type, listener);
    return this;
  }

  off<K extends InfrastructureEvent['type']>(
    type: K,
    listener: (payload: Extract<InfrastructureEvent, { type: K }>) => void
  ): this {
    this.emitter.off(type, listener);
    return this;
  }
}

export const eventBus = new TypedEventBus();
