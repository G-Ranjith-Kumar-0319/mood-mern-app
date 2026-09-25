import { isReplicaSet } from '../config/database.js';
import { logger } from '../config/logger.js';
import { registerLiveSubscriberGauge } from '../observability/metrics.js';
import {
  ExpressionDetectionModel,
  type ExpressionDetection,
} from '../models/expressionDetection.model.js';
import type { OwnerId } from '../repositories/expression.repository.js';
import { toDetectionDto, type ExpressionDetectionDto } from './expression.service.js';

export interface LiveEvent {
  type: 'detection.created';
  detection: ExpressionDetectionDto;
}

interface Subscriber {
  send: (event: LiveEvent) => void;
  /** Ends the underlying HTTP response (used on shutdown). */
  close: () => void;
}

type DetectionChangeStream = ReturnType<typeof ExpressionDetectionModel.watch>;

const ANONYMOUS = 'anonymous';
const RESTART_DELAY_MS = 5000;

/** Subscribers are grouped by owner so an event only ever reaches that owner's browsers. */
export const ownerKey = (ownerId: OwnerId) => ownerId?.toString() ?? ANONYMOUS;

/**
 * Pushes "a detection was saved" to that owner's open browser tabs.
 *
 * Every API instance runs one MongoDB change stream on the detections
 * collection. Because each instance sees *every* insert — whichever instance
 * handled the request — no extra pub/sub system (e.g. Redis) is needed for
 * multi-instance fan-out. Requires a replica set (all our deployments are).
 */
class LiveUpdateHub {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private stream: DetectionChangeStream | null = null;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | undefined;

  subscribe(ownerId: OwnerId, subscriber: Subscriber): () => void {
    const key = ownerKey(ownerId);
    const set = this.subscribers.get(key) ?? new Set();
    set.add(subscriber);
    this.subscribers.set(key, set);
    return () => {
      set.delete(subscriber);
      if (set.size === 0) this.subscribers.delete(key);
    };
  }

  get subscriberCount(): number {
    let count = 0;
    this.subscribers.forEach((set) => (count += set.size));
    return count;
  }

  publish(document: ExpressionDetection): void {
    const set = this.subscribers.get(ownerKey(document.userId ?? null));
    if (!set) return;
    const event: LiveEvent = { type: 'detection.created', detection: toDetectionDto(document) };
    set.forEach((subscriber) => subscriber.send(event));
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (!(await isReplicaSet())) {
      logger.warn('Live updates disabled: change streams need a MongoDB replica set');
      return;
    }
    this.open();
  }

  /**
   * Ends every open event stream. Called first during shutdown: otherwise these
   * never-ending responses would keep the HTTP server from closing. Browsers
   * reconnect automatically (to another instance behind the load balancer).
   */
  endAllStreams(): void {
    this.subscribers.forEach((set) => set.forEach((subscriber) => subscriber.close()));
    this.subscribers.clear();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    this.endAllStreams();
    await this.stream?.close();
    this.stream = null;
  }

  private open(): void {
    // Only inserts are watched: their events carry the full document, including the owner.
    const stream = ExpressionDetectionModel.watch([{ $match: { operationType: 'insert' } }]);
    this.stream = stream;
    stream.on('change', (change: { fullDocument?: ExpressionDetection }) => {
      if (change.fullDocument) this.publish(change.fullDocument);
    });
    stream.on('error', (error: unknown) => {
      logger.error({ err: error }, 'Change stream failed; restarting');
      void stream.close();
      if (!this.stopped) this.restartTimer = setTimeout(() => this.open(), RESTART_DELAY_MS);
    });
    logger.info('Live updates: watching detections');
  }
}

export const liveUpdates = new LiveUpdateHub();
registerLiveSubscriberGauge(() => liveUpdates.subscriberCount);
