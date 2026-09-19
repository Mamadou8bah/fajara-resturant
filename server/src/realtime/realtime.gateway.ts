import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOrigins } from '../common/env';

@WebSocketGateway({
  cors: {
    origin: corsOrigins(),
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.emit('connected', {
      at: new Date().toISOString(),
      message: 'Fajara realtime connected — refetch authoritative state on load',
    });
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room: string },
  ) {
    if (!body?.room) return { ok: false };
    client.join(body.room);
    return { ok: true, room: body.room };
  }

  emitToRoom(room: string, event: string, payload: unknown) {
    this.server.to(room).emit(event, payload);
  }
}
