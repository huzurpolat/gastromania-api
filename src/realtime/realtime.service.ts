import { Injectable, MessageEvent } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';

export interface RealtimePayload<T = unknown> {
  event: string;
  payload: T;
  createdAt: string;
}

@Injectable()
export class RealtimeService {
  private readonly events = new Subject<MessageEvent>();

  stream(): Observable<MessageEvent> {
    return this.events.asObservable();
  }

  streamWhere(predicate: (event: MessageEvent) => boolean): Observable<MessageEvent> {
    return this.events.asObservable().pipe(filter(predicate));
  }

  publish<T>(event: string, payload: T): void {
    this.events.next({
      type: event,
      data: {
        event,
        payload,
        createdAt: new Date().toISOString(),
      } satisfies RealtimePayload<T>,
    });
  }
}
