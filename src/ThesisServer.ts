import SocketIO, { Socket } from 'socket.io';
import http, { Server } from 'http';
import express, { Express, raw, Request, Response } from 'express';
import cors from 'cors';
import mongoose, { Connection } from 'mongoose';
import { config as configureDotenv } from 'dotenv';
import presentationsRouter from './routes/Presentations';
import { IPresentation } from './models/presentation.model';
import Session from './Session';
import { initialiseNewPresenter } from './PresenterHandler';
import { initialiseNewAttendee } from './AttendeeHandler';
import ClientEvents from './events/ClientEvents';
import PresenterEvents from './events/PresenterEvents';
import AttendeeEvents from './events/AttendeeEvents';

export default class ThesisServer {
    private readonly server: Server;
    private readonly socketServer: SocketIO.Server;
    private readonly app: Express;
    private readonly port: number;
    private readonly dbUri: string;
    private readonly dbConnection: Connection;

    sessions: Session[] = [];

    constructor(port?: number) {
        configureDotenv();
        this.app = express();
        this.port = port ?? parseInt(process.env.PORT, 10);
        this.dbUri = process.env.ATLAS_URI ?? 'UNDEFINED_DB_URI';

        this.app.use(cors());
        this.app.use(express.json());
        this.app.use('/presentations', presentationsRouter);

        this.connect().catch(reason => {
            console.error(
                `Unable to establish a connection to the server: ${reason}`
            );
        });
        this.dbConnection = mongoose.connection;
        this.dbConnection.once('open', () => {
            console.log('MongoDB connection established successfully');
        });

        this.app.get('/', (req: Request, res: Response) => {
            res.send('Do I really need this?');
        });

        this.server = http.createServer(this.app);
        this.server.listen(this.port, () =>
            console.log(`SocketIO server is now listening on port ${this.port}`)
        );
        this.socketServer = SocketIO(this.server);

        this.socketServer.on('connection', (socket: Socket) => {
            this.handleClientConnection(socket);
        });
    }

    private handleClientConnection(socket: Socket) {
        socket.on(ClientEvents.Disconnect, () =>
            console.log('Client disconnected')
        );
        socket.on(PresenterEvents.PresenterConnected, (data: any) =>
            this.handlePresenterConnected(socket, data)
        );
        socket.on(AttendeeEvents.AttendeeConnected, (data: any) =>
            this.handleAttendeeConnected(socket, data)
        );

        console.log('New client connected');
    }

    private handlePresenterConnected = (socket: Socket, message: any) => {
        initialiseNewPresenter(this, socket);
    };

    private handleAttendeeConnected = (socket: Socket, message: any) => {
        initialiseNewAttendee(this, socket);
    };

    validateSessionId = (sessionId: string) => {
        let validated = false;
        console.log('id: ' + sessionId);
        this.sessions.forEach((session, i) => {
            if (session.sessionId === sessionId) {
                validated = true;
                return;
            }
        });
        return validated;
    };

    private retrievePresentationFromDB = async () => {
        await this.dbConnection
            .useDb('PresentationsDatabase')
            .collection('Presentations')
            .find<IPresentation>()
            .next();
    };

    getSession = (sessionId: string): Session => {
        let result: Session;
        this.sessions.forEach(session => {
            if (session.sessionId === sessionId) {
                result = session;
                return;
            }
        });

        return result;
    };

    public get(path: string, callback: (Request, Result) => void) {
        this.app.get(path, callback);
    }

    private async connect() {
        await mongoose.connect(this.dbUri, {
            useNewUrlParser: true,
            useCreateIndex: true,
            useUnifiedTopology: true
        });
    }
}

export function getNewSessionId(): string {
    return Math.floor(100000 + Math.random() * 900000).toString(10);
}
