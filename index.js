import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';

const app = express();
const server = createServer(app);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const io = new Server(server, {
    cors: { origin: CORS_ORIGIN }
});

// DB setup
console.log('DATABASE_URL:', process.env.DATABASE_URL ?? 'UNDEFINED');

const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

await db.query(`
    CREATE TABLE IF NOT EXISTS mensajes (
        id        SERIAL PRIMARY KEY,
        canal     TEXT    NOT NULL,
        usuario   TEXT    NOT NULL,
        texto     TEXT    NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

const CHANNELS = ['general', 'random', 'help'];

io.on('connection', (socket) => {
    console.log('connected:', socket.id);

    socket.join('general');

    const emitUsers = () => {
        io.emit('users', [...io.sockets.sockets.keys()]);
    };
    emitUsers();

    socket.on('join channel', async (channel) => {
        CHANNELS.forEach(ch => socket.leave(ch));
        socket.join(channel);

        // enviar historial del canal
        const { rows } = await db.query(
            'SELECT usuario, texto FROM mensajes WHERE canal = $1 ORDER BY id ASC LIMIT 50',
            [channel]
        );
        socket.emit('historial', rows);
    });

    socket.on('chat message', async ({ text, channel }) => {
        await db.query(
            'INSERT INTO mensajes (canal, usuario, texto) VALUES ($1, $2, $3)',
            [channel, socket.id, text]
        );

        io.to(channel).emit('chat message', {
            user: socket.id,
            text,
            channel
        });
    });

    socket.on('disconnect', () => {
        console.log('disconnected:', socket.id);
        emitUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});