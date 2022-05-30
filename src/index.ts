import { BazirRemote, BazirRemoteContainer } from "@bazir/remote";
const enum NetworkSettings {
	Name = "_Network_",
	Event = "_Event_",
	Function = "_Function_",
}
type ServerEventsFunction = (player: Player, ...args: unknown[]) => unknown;
type ClientEventsFunction = (...args: unknown[]) => unknown;
export class ServerNetwork {
	private RemoteContainer: BazirRemoteContainer;
	Invoke<T>(key: string, player: Player, ...args: unknown[]): Promise<T> {
		assert(typeOf(key) === "string", "key must be string");
		return this.RemoteContainer.get(`${NetworkSettings.Function}`)!.InvokeClient<T>(player, `${key}`, ...args);
	}
	Fire(key: string, player: Player | Player[], ...args: unknown[]) {
		assert(typeOf(key) === "string", "key must be string");
		if (typeIs(player, "table")) {
			return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireClients(
				player as Player[],
				`${key}`,
				...args,
			);
		}
		assert(typeOf(player) === "Instance", "player must be Instance");
		return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireClient(player, `${key}`, ...args);
	}
	FireAll(key: string, ...args: unknown[]) {
		assert(typeOf(key) === "string", "key must be string");
		return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireAllClients(`${key}`, ...args);
	}
	FireOther(key: string, ignoreclient: Player[], ...args: unknown[]) {
		assert(typeOf(key) === "string", "key must be string");
		return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireOtherClients(ignoreclient, `${key}`, ...args);
	}
	FireAllWithinDistance(key: string, position: Vector3, distance: number, ...args: unknown[]) {
		assert(typeOf(key) === "string", "key must be string");
		return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireAllClientsWithinDistance(
			position,
			distance,
			`${key}`,
			...args,
		);
	}
	FireOtherWithinDistance(
		key: string,
		ignoreclient: Player[],
		position: Vector3,
		distance: number,
		...args: unknown[]
	) {
		assert(typeOf(key) === "string", "key must be string");
		return this.RemoteContainer.get(`${NetworkSettings.Event}`)!.FireOtherClientsWithinDistance(
			ignoreclient,
			position,
			distance,
			`${key}`,
			...args,
		);
	}
	BindFunctions(functions: { [k: string]: ServerEventsFunction }) {
		assert(typeOf(functions) === "table", "functions must be table");
		const Remote = this.RemoteContainer.get(`${NetworkSettings.Function}`)!;
		for (const [key, value] of pairs(functions)) {
			new BazirRemote(`${key}`, Remote).OnServerInvoke = value;
		}
		return this;
	}
	BindEvents(events: { [k: string]: ServerEventsFunction }) {
		assert(typeOf(events) === "table", "events must be table");
		const Remote = this.RemoteContainer.get(`${NetworkSettings.Event}`)!;
		for (const [key, value] of pairs(events)) {
			new BazirRemote(`${key}`, Remote).OnServerEvent.Connect(value);
		}
		return this;
	}
	constructor(parent: RemoteParent = script, name = NetworkSettings.Name) {
		assert(isServer, "Cannot create server network on client");
		this.RemoteContainer = new BazirRemoteContainer(
			name,
			[`${NetworkSettings.Function}`, `${NetworkSettings.Event}`],
			parent,
		);
	}
}
export class ClientNetwork {
	private RemoteContainer: BazirRemoteContainer;
	private Networks = {
		[NetworkSettings.Function]: new Map<string, BazirRemote>(),
		[NetworkSettings.Event]: new Map<string, BazirRemote>(),
	};
	private Comunications = {
		[NetworkSettings.Function]: new Map<string, ClientEventsFunction>(),
		[NetworkSettings.Event]: new Map<string, Array<ClientEventsFunction>>(),
	};
	public static Is(object: unknown): object is typeof ClientNetwork.prototype {
		return typeIs(object, "table") && getmetatable(object) === ClientNetwork;
	}
	Invoke<T>(key: string, ...args: unknown[]): Promise<T> | undefined {
		assert(typeOf(key) === "string", "key must be string");
		return this.Networks[NetworkSettings.Function].get(key)?.InvokeServer<T>(...args);
	}
	Fire(key: string, ...args: unknown[]) {
		assert(typeOf(key) === "string", "key must be string");
		return this.Networks[NetworkSettings.Event].get(key)?.FireServer(...args);
	}
	BindFunctions(functions: { [k: string]: ClientEventsFunction }) {
		assert(typeOf(functions) === "table", "functions must be table");
		for (const [key, value] of pairs(functions)) {
			this.Comunications[NetworkSettings.Function].set(`${key}`, value);
		}
		return this;
	}
	BindEvents(events: { [k: string]: ClientEventsFunction }) {
		assert(typeOf(events) === "table", "events must be table");
		for (const [key, value] of pairs(events)) {
			(
				this.Comunications[NetworkSettings.Event].get(`${key}`) ??
				this.Comunications[NetworkSettings.Event].set(`${key}`, []).get(`${key}`)
			)?.push(value);
		}
		return this;
	}
	constructor(parent: RemoteParent = script, name = NetworkSettings.Name) {
		assert(!isServer, "Cannot create client network on server");
		this.RemoteContainer = new BazirRemoteContainer(name, [], parent);

		const EventRemote = this.RemoteContainer.waitfor(`${NetworkSettings.Event}`, Settings.Clienttimeout);
		assert(EventRemote, "remote event not found");
		const FunctionRemote = this.RemoteContainer.waitfor(`${NetworkSettings.Function}`, Settings.Clienttimeout);
		assert(FunctionRemote, "remote function not found");

		EventRemote.ChildAdded.Connect((child) => {
			this.Networks[NetworkSettings.Event].set(child.Path, child);
		});
		EventRemote.ChildRemoved.Connect((child) => {
			this.Networks[NetworkSettings.Event].delete(child.Path);
		});
		EventRemote?.GetChildren().forEach((child) => {
			this.Networks[NetworkSettings.Event].set(child.Path, child);
		});
		EventRemote?.OnClientEvent.Connect((key, ...args) => {
			assert(typeIs(key, "string"), "Key must be string");
			const funcs = this.Comunications[NetworkSettings.Event].get(key);
			if (funcs) {
				funcs.forEach(
					async((func) => {
						func(...args);
					}),
				);
			}
		});

		FunctionRemote.ChildAdded.Connect((child) => {
			this.Networks[NetworkSettings.Function].set(child.Path, child);
		});
		FunctionRemote.ChildRemoved.Connect((child) => {
			this.Networks[NetworkSettings.Function].delete(child.Path);
		});
		FunctionRemote?.GetChildren().forEach((child) => {
			this.Networks[NetworkSettings.Function].set(child.Path, child);
		});
		FunctionRemote!.OnClientInvoke = (key, ...args) => {
			assert(typeIs(key, "string"), "Key must be string");
			const func = this.Comunications[NetworkSettings.Function].get(key);
			assert(func !== undefined, "Cannot find function");
			return func(...args);
		};
	}
}