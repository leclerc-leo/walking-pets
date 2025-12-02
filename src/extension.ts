import path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { WebSocketServer } from 'ws';

type UserPetObject = {
    id?: any;
    source?: any;
    type?: any;
    scale?: any;
};

type ConfigPetObject = {
    idle: {
        size: number;
    }
    walk: {
        size: number;
    }
    can_fly?: boolean;
};

type CategoryObject = {
    name: string;
    categories?: Record<string, CategoryObject>;
}

type ConfigObject = {
    name: string;
    categories: Record<string, CategoryObject>;
    pets: Record<string, ConfigPetObject>;
}

type CategoriesObject = {
    name: string;
    source: string;
    icon?: string;
    categories?: Record<string, CategoryObject>;
    pets: Record<string, ConfigPetObject>;
};

type CatalogData = {
    addedPets: Array<UserPetObject>;
    addedDecorations: Array<{ source: string; type: string }>;
    categories: Record<string, CategoriesObject>;
    icons: Record<string, string>;
};

const sentFiles: Record<number, Set<string>> = {};
const runningSockets: Record<number, WebSocketServer> = {};

function hash32(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
}

function getWorkspacePath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return "noworkspace"; }
    return folders[0].uri.path || "noworkspace";
}

function getWorkspacePort(): number {
    const uri = getWorkspacePath();
    const hash = hash32(uri);
    return 30000 + (hash % 10000);
}


function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const htmlPath = path.join(context.extensionPath, 'media', 'pet_catalog', 'page.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Convert resource URLs to webview URIs
    html = html.replace(/{{(.*?)}}/g, (_, relPath) => {
        const fullPath = vscode.Uri.joinPath(context.extensionUri, 'media', relPath.trim());
        return webview.asWebviewUri(fullPath).toString();
    });

    html = html.replace('[[theme]]', 
           vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark 
        || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast
        ? 'dark' : 'light'
    );
    return html;
}



function getNextAvailableId(pets: Array<UserPetObject>): number {
    const existingIds = new Set<number>();
    for (const pet of pets) {
        if (typeof pet.id === 'number') {
            existingIds.add(pet.id);
        }
    }

    let id = 1;
    while (existingIds.has(id)) {
        id++;
    }
    return id;
}


function getPetConfig() {
    const rawConfig = vscode.workspace.getConfiguration('walkingPets');

    const pets: Array<UserPetObject> = rawConfig.get('pets', []);

    let hasMissingIds = false;
    for (const pet of pets) {
        if (pet.id === undefined) {
            pet.id = getNextAvailableId(pets);
            hasMissingIds = true;
        }
    }

    if (hasMissingIds) {
        rawConfig.update('pets', pets, vscode.ConfigurationTarget.Global);
    }

    return pets;
}


/**
 * This websocket system is bad
 * 
 * What should be done instead:
 * - start a server using a hash of the workspace path as port (like done rn)
 * - when a connection is made, try to start a websocket on the next available port
 *   this is done by checking if a port is in use, and if it is, incrementing the port number
 * - send the new port to the client, and have the client connect to that port
 * 
 */ 

export function activate(context: vscode.ExtensionContext) {
    const wss = new WebSocketServer({ port: getWorkspacePort(), host: 'localhost'});

    const media = path.join(context.extensionPath, 'media');
    const rawConfig = vscode.workspace.getConfiguration('walkingPets');
    let GlobalScale = rawConfig.get('scale', 100);
    if (typeof GlobalScale !== 'number' || isNaN(GlobalScale) || GlobalScale <= 0) {
        GlobalScale = 100;
    }

    function sendConfigAndFiles (socket: any, port: number) {
        const pets = getPetConfig();
        const configs: Record<string, ConfigObject> = {};

        const petDatas: Array<any> = [];
        for (const pet of pets || []) {
            const {id, source, type, scale} = pet;
            if (
                typeof source !== 'string'
                || typeof type !== 'string'
                || !(typeof scale === 'number' || scale === undefined)
            ) {
                continue;
            }

            if (!configs[source]) {
                const configPath = path.join(media, 'pets', source, 'config.json');
                try {
                    const petConfig = require(configPath);
                    configs[source] = petConfig;
                } catch (error) {
                    console.error(`Failed to load config for source ${source}:`, error);
                    continue;
                }
            }

            const petConfig = configs[source].pets[type];

            const states : Record<string, string> = {};
            for (const state of ['idle', 'walk']){
                const filePath = path.join(media, 'pets', source, type, `${state}.gif`);
                if (fs.existsSync(filePath)) { states[state] = path.join(source, type, `${state}.gif`);  }
            }

            const petData = {
                id,
                source,
                type,
                sizes: {
                    idle: (petConfig.idle.size * 2) * ((scale || GlobalScale) / 100),
                    walk: (petConfig.walk.size * 2) * ((scale || GlobalScale) / 100),
                },
                states,
            };
            petDatas.push(petData);
        }

        socket.send(JSON.stringify({ type: 'config', pets: petDatas}));
        sentFiles[port] = new Set<string>();

        // probably better to first load all idles and walks, then the rest

        for (const pet in petDatas) {
            for (const state in petDatas[pet].states) {
                const filePath = petDatas[pet].states[state];
                if (sentFiles[port].has(filePath)) {
                    continue;
                }
                sentFiles[port].add(filePath);

                try {
                    const fileData = fs.readFileSync(path.join(media, 'pets', filePath));
                    const base64Data = fileData.toString('base64');
                    const dataUri = `data:image/${path.extname(filePath).slice(1)};base64,${base64Data}`;
                    socket.send(JSON.stringify({
                        type: 'asset',
                        file: 'pets/' + filePath,
                        content: dataUri
                    }));
                } catch (error) {
                    console.error(`Failed to load image for state ${state} at ${filePath}:`, error);
                }
            }
        }

        const iconsPath = path.join(media, 'icons', 'config.json');
        let iconConfig = {};
        try {
            iconConfig = require(iconsPath);
        } catch (error) {
            console.error(`Failed to load icon config:`, error);
        }

        for (const [iconName, iconFile] of Object.entries<string>(iconConfig)) {
            const iconPath = path.join(media, 'icons', iconFile);
            try {
                const fileData = fs.readFileSync(iconPath);
                const base64Data = fileData.toString('base64');
                const dataUri = `data:image/${path.extname(iconFile).slice(1)};base64,${base64Data}`;
                socket.send(JSON.stringify({
                    type: 'asset',
                    file: 'icons/' + iconName,
                    content: dataUri
                }));
            } catch (error) {
                console.error(`Failed to load icon ${iconName} at ${iconPath}:`, error);
            }
        }
    }

    wss.on('connection', (socket) => {
        wss.close();
        const port = Math.floor(40000 + Math.random() * 10000);
        socket.send(JSON.stringify({ type: 'socket', port: port }));
        runningSockets[port] = new WebSocketServer({ port: port, host: 'localhost' });
        runningSockets[port].on('connection', (socket) => sendConfigAndFiles(socket, port));
    });

    context.subscriptions.push({
        dispose() {
            wss.close();
            for (const port in runningSockets) {
                runningSockets[port].close();
            }
        }
    });



    const disposable = vscode.commands.registerCommand('walkingPets.openCatalog', () => {
        const panel = vscode.window.createWebviewPanel(
            'petCatalog',
            'Pet Catalog',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );

        panel.webview.html = getWebviewContent(context, panel.webview);

        const pets: Array<UserPetObject> = getPetConfig();
        const data: CatalogData = {
            addedPets: pets,
            addedDecorations: [],
            categories: {},
            icons: {}
        };

        const sources = fs.readdirSync(path.join(context.extensionPath, 'media', 'pets'));
        for (const source of sources) {
            const sourcePath = path.join(context.extensionPath, 'media', 'pets', source);
            const configPath = path.join(sourcePath, 'config.json');
            
            if (!fs.existsSync(configPath)) {
                continue;
            }
            
            const config: ConfigObject = require(configPath);
            const category: CategoriesObject = {
                name: config.name,
                source: source,
                categories: config.categories || {},
                pets: config.pets,
            };

            const iconPath = path.join(sourcePath, 'icon.png');
            if (fs.existsSync(iconPath)) {
                const iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'pets', source, 'icon.png');
                const webviewUri = panel.webview.asWebviewUri(iconPath).toString();
                category.icon = webviewUri;
            }
            
            data.categories[category.source] = category;

            for (const petType in config.pets) {
                const iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'pets', source, petType, 'idle.gif');
                const webviewUri = panel.webview.asWebviewUri(iconPath).toString();
                data.icons[`pets/${source}/${petType}`] = webviewUri;
            }
        }

        // recurse through backgrounds folder and add all images to 'backgrounds/ + folder structure + '/ + image name
        const backgroundsPath = path.join(context.extensionPath, 'media', 'backgrounds');
        function addBackgroundsFromFolder(folderPath: string, relativePath: string) {
            const items = fs.readdirSync(folderPath);
            for (const item of items) {
                const itemPath = path.join(folderPath, item);
                const itemRelativePath = path.join(relativePath, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    addBackgroundsFromFolder(itemPath, itemRelativePath);
                } else if (stats.isFile() && ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(path.extname(item).toLowerCase())) {
                    const iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'backgrounds', itemRelativePath);
                    const webviewUri = panel.webview.asWebviewUri(iconPath).toString();
                    const name = path.join(relativePath, path.parse(item).name).replace(/\\/g, '/');
                    data.icons[`backgrounds/${name}`] = webviewUri;
                }
            }
        }
        addBackgroundsFromFolder(backgroundsPath, '');

        panel.webview.onDidReceiveMessage(async msg => {
            if (msg.command === 'requestInitialData') {
                panel.webview.postMessage({ type: 'initialData', data });
            }
            else if (msg.command === 'add') {
                const pets = getPetConfig();
                pets.push({ id: msg.id, source: msg.source, type: msg.type });
                await rawConfig.update('pets', pets, vscode.ConfigurationTarget.Global);

                let name = msg.type.split('/').pop();
                name = name.charAt(0).toUpperCase() + name!.slice(1);
                vscode.window.showInformationMessage(`${name} added!`);
            }
            else if (msg.command === 'remove') {
                const pets = getPetConfig();
                let name = msg.type.split('/').pop();
                name = name.charAt(0).toUpperCase() + name!.slice(1);

                const petIndex = parseInt(msg.id, 10);
                const index = pets.findIndex(pet => pet.id === petIndex);
                if (index === -1) {
                    vscode.window.showErrorMessage(`${name} not found in your pets!`);
                    return;
                }

                pets.splice(index, 1);
                await rawConfig.update('pets', pets, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`${name} removed!`);
            }
            else if (msg.command === 'updateScale') {
                const pets = getPetConfig();
                const petIndex = parseInt(msg.id, 10);
                const index = pets.findIndex(pet => pet.id === petIndex);
                if (index === -1) {
                    vscode.window.showErrorMessage(`Pet not found in your pets!`);
                    return;
                }

                pets[index].scale = parseInt(msg.scale, 10);
                await rawConfig.update('pets', pets, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Pet scale updated!`);
            }
        });
    });


    context.subscriptions.push(disposable);


    vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('walkingPets')) { return; }

        for (const port in runningSockets) {
            const sockets = runningSockets[port].clients;
            sockets.forEach((socket) => {
                sendConfigAndFiles(socket, parseInt(port, 10));
            });
        }
    });
}
