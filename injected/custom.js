
function createDeferred() {  // Welcome to JavaScript async hell
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}


/**
 * Since assets are loaded asynchronously, we need a way to fetch them
 * and rerender when they are available.
 * 
 * This should only happen during initialization or due to configuration changes.
 */
const assetHooks = {};
function fetchAsset(name, callback) {
    if (name in assets) { return callback(assets[name]); }
    assetHooks[name] = assetHooks[name] || [];
    assetHooks[name].push(callback);
}

const assets = new Proxy({}, {
    set: (target, name, value) => {
        target[name] = value;
        if (name in assetHooks) {
            assetHooks[name].forEach((cb) => cb(value));
            delete assetHooks[name];
        }
        return true;
    }
});




class PetRenderer {
    constructor(manager, petConfig) {
        this.manager = manager;
        this.type = petConfig.type;
        this.source = petConfig.source;
        
        this.states = petConfig.states;
        this.flying = false;
        this.restrict_play_area = {};

        this.containerRef = document.createElement("div");
        this.containerRef.className = "pet-container debug";
        this.containerRef.style.zIndex = -1;

        this.petRef = document.createElement("img");
        this.petRef.className = "pet-image";
        this.sizes = petConfig.sizes;
        this.setHeight(petConfig.sizes.idle);

        this.containerRef.appendChild(this.petRef);
        document.body.appendChild(this.containerRef);

        this.codeElementStates = {
            sidebarWidth: 0,
            terminalHeight: 0,
            statusHeight: 0,
        };

        this._interruptionPromises = [];
        this._clearMoving = null;

        this.observers = [];

        this.manager.register_event('ready', () => {
            // TODO check if there's a better way for the terminal
            // I can listen for those for every pet and update them all at once
            this.observers.push(this._listen_for_changes(".sidebar.left", "offsetWidth", 'sidebarWidth'));
            this.observers.push(this._listen_for_changes(".part.panel.basepanel.bottom.pane-composite-part", "offsetHeight", 'terminalHeight'));
            this.observers.push(this._listen_for_changes(".statusbar", "offsetHeight", 'statusHeight'));
 
            this.position = { // TODO Remove and add to _update_position arguments
                x: Math.round(Math.random() * (this.max_right - this.min_left - this.width)),
                y: -5, // probably needs to be a % of the height in the petConfig
            };
            this._update_position();   

            this.containerRef.style.zIndex = 100;
            this.manager._trigger_state('rendered');

        });
    }

    get min_bottom() {
        // Multiple walking layer, since pet can be dragged
        let offset = this.codeElementStates.terminalHeight + this.codeElementStates.statusHeight;
        return Math.max(offset - 5, 0);
    }

    get max_bottom() {
        return window.innerHeight - this.height;
    }

    get min_left() { 
        let offset = 0;

        if (this.restrict_play_area.left_side_bar) {
            offset += this.codeElementStates.sidebarWidth;
        }

        return offset;
    }

    get max_right() {
        let offset = window.innerWidth;

        // TODO add right sidebar support

        return offset;
    }

    get width() {
        return this.containerRef.getBoundingClientRect().width;
    }

    setHeight(height) {
        this.height = height;
        this.petRef.style.height = `${this.height}px`;
    }

    _listen_for_changes(selector, property, propertyName, defaultValue=0) {
        let prevValue = defaultValue;
        let debounceTimer = null;

        const runCheck = (update_position=true) => {
            const el = document.querySelector(selector);
            if (!el) {
                return this.manager.warn(`Could not find element for selector: ${selector}`);
            }

            const newValue = el[property] || defaultValue;

            if (prevValue !== newValue) {
                prevValue = newValue;
                this.codeElementStates[propertyName] = newValue;
                if (update_position) { this._update_position(); }
            }
        };

        const check = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runCheck, 50);
        };

        runCheck(false);
        const observer = new MutationObserver(check);
        observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
        });
        return observer;
    }

    _update_position() {
        let destination_x = this.min_left + this.position.x;
        let destination_y = this.min_bottom + this.position.y;

        if (destination_x < this.min_left) {
            destination_x = this.min_left;
            this.position.x = 0;  // TODO: Can this be removed ???
        } else if (destination_x > this.max_right - this.width) {
            destination_x = this.max_right - this.width;
            this.position.x = destination_x - this.min_left;
        }

        if (destination_y < this.min_bottom) {
            destination_y = this.min_bottom;
            this.position.y = 0;
        } else if (destination_y > this.max_bottom) {
            destination_y = this.max_bottom;
            this.position.y = destination_y - this.min_bottom;
        }

        this.containerRef.style.left = `${destination_x}px`;
        this.containerRef.style.bottom = `${destination_y}px`;
    }

    move(offset_x, offset_y) {
        return new Promise(async (res) => {
            const maxPerStep = {
                // TODO walkspeed / flyspeed to make it configurable per pet
                x: 50,
                y: 30,
            };

            let can_continue_moving = true;
            const resolve = () => {
                can_continue_moving = false;
                res(false);
            };
  
            this._clearMoving = () => {
                can_continue_moving = false;
                res(true);
            };
            
            const destination_x = this.position.x + offset_x;
            const destination_y = this.position.y + offset_y;

            let remaining_x = offset_x;
            let remaining_y = offset_y;
            let i = 0;
            while (i < 2 && can_continue_moving) {
                i += 1;

                if (Math.abs(remaining_x) < maxPerStep.x * 0.5 && Math.abs(remaining_y) < maxPerStep.y * 0.5) {
                    return resolve();
                }

                if (this._interruptionPromises.length > 0) {
                    while (this._interruptionPromises.length > 0) {
                        const interruption = this._interruptionPromises.shift();
                        await interruption;
                    }
                    i -= 2;
                    continue;
                }

                const direction = remaining_x >= 0 ? 1 : -1;
                this.petRef.style.transform = 'scaleX(' + direction + ')';

                this.position.x += remaining_x;
                this.position.y += remaining_y;
                const walkDuration = Math.abs(remaining_x / maxPerStep.x);

                this.containerRef.style.transition = `left ${walkDuration}s linear`;
                this.render('walk');
                this._update_position();

                remaining_x = destination_x - parseFloat(window.getComputedStyle(this.containerRef).left) + this.min_left;
                remaining_y = destination_y - parseFloat(window.getComputedStyle(this.containerRef).bottom) + this.min_bottom;
                await new Promise((r) => setTimeout(r, walkDuration * 1000));
            }

            if (can_continue_moving) {
                resolve();
            }
        });
    }

    throw(replayX, replayY) {
        return new Promise((resolve) => {
            // ----- Parameters you can tweak -----
            const physicsGravity = -0.6;    // gravity per frame (pixels/frame^2)
            const physicsFriction = 0.98;   // velocity multiplier per frame (air drag)
            const bounceFactor = 0.3;       // energy retention on bounce
            const stopThreshold = 0.5;      // when both |vx| and |vy| < threshold, stop
            // ------------------------------------

            let interrupted = false;
            this.containerRef.style.transition = "none";

            // allow interruption from outside
            this._clearMoving = () => {
                interrupted = true;
                resolve(true);
            };

            // Helper to update visual orientation
            const setDirectionFor = (vx) => {
                const dir = vx >= 0 ? 1 : -1;
                this.petRef.style.transform = `scaleX(${dir})`;
            };

            // ---- Replay phase: follow the sampled deltas to reproduce the arc ----
            (async () => {
                // ---- Determine initial velocity (tangent) from last few deltas ----
                // compute average of last 2-3 deltas to smooth spikes
                const tangentCount = Math.min(3, replayX.length);
                let sumX = 0, sumY = 0;
                for (let i = replayX.length - tangentCount; i < replayX.length; i++) {
                    if (i >= 0) {
                        sumX += replayX[i];
                        sumY += replayY[i];
                    }
                }
                // Velocities are in pixels per replay step (we treat replay step ~ 1 frame)
                // So vx/vy units are pixels per frame
                let velX = (sumX / tangentCount) || 0;
                let velY = (sumY / tangentCount) || 0;

                // If the replay had only 1 sample but the original arrays had more earlier samples,
                // you could consider using a weighted average over the full arrays. For now this is fine.

                // Small safeguard: scale down extremely large velocities (optional)
                const maxInitial = 150; // px/frame clamp
                const clamp = (v, m) => Math.max(-m, Math.min(m, v));
                velX = clamp(velX, maxInitial);
                velY = clamp(velY, maxInitial);

                // ---- Physics phase: gravity, friction, bounce ----
                const physicsTick = () => {
                    if (interrupted) { return; }

                    // gravity (remember: your y is bottom-based, so gravity reduces vy)
                    velY += physicsGravity;

                    // integrate
                    this.position.x += velX;
                    this.position.y += velY;

                    // collisions with world bounds (convert to your position space)
                    // LEFT WALL
                    if (this.position.x < 0) {
                        this.position.x = 0;
                        velX = -velX * bounceFactor;
                    }

                    // RIGHT WALL
                    if (this.position.x > (this.max_right - this.min_left - this.width)) {
                        this.position.x = this.max_right - this.min_left - this.width;
                        velX = -velX * bounceFactor;
                    }

                    // FLOOR
                    if (this.position.y < 0) {
                        this.position.y = 0;
                        velY = -velY * bounceFactor;
                    }

                    // ROOF
                    if (this.position.y > (this.max_bottom - this.min_bottom)) {
                        this.position.y = this.max_bottom - this.min_bottom;
                        velY = -velY * bounceFactor;
                    }

                    // Apply friction / air drag
                    velX *= physicsFriction;
                    velY *= physicsFriction;

                    // update sprite facing
                    setDirectionFor(velX);

                    this._update_position();

                    // stopping condition
                    if (Math.abs(velX) < stopThreshold && Math.abs(velY) < stopThreshold && this.position.y === 0) {
                        // resting on ground and nearly stopped
                        interrupted = false;
                        this._clearMoving = null;
                        resolve(false);
                        return;
                    }

                    // continue
                    setTimeout(physicsTick, 1000 / 100); // ~100fps
                };

                // start physics
                physicsTick();
            })();
        });
    }

    /**
     * Interrupts any ongoing movement
     * @param {Promise<void>} deferred A deferred promise that will be resolved when movement can continue
     */
    interrupt_movement(deferred, cancel_move=false) {
        this._interruptionPromises.push(deferred);
        if (cancel_move && this._clearMoving) {
            // Maybe instead wait for all promise and then resolve it so the main loop is broked naturally?
            this._clearMoving();
            this._clearMoving = null;
            this._interruptionPromises = [];
        }
        this.position.x = parseFloat(window.getComputedStyle(this.containerRef).left) - this.min_left;
        this.position.y = parseFloat(window.getComputedStyle(this.containerRef).bottom) - this.min_bottom;
        this.containerRef.style.transition = 'none';  // stop the moving transition
        this.petRef.style.transform = 'scaleX(1)'; // reset direction
        this._update_position();
    }

    render(state) {
        fetchAsset('pets/' + this.states[state], (asset) => {
            this.state = state;
            this.petRef.src = asset;
            this.setHeight(this.sizes[state]);
        });
    }

    destroy() {
        this.observers.forEach((obs) => obs.disconnect());
        this.containerRef.remove();
    }
}



class PetController {

    constructor(manager) {
        this.manager = manager;
        this.renderer = this.manager.renderer;

        this.renderer.render('idle');
        this.changeState('idle');

        this.events = {
            mouseenter: () => this._onMouseEnter(),
            mouseleave: () => this._onMouseLeave(),
            mousedown: () => this._onMouseDown(),
        };
    
        this.user_interactions = [];
        this.interrupt_movement = null;

        this.hoverIconRef = document.createElement("img");
        this.hoverIconRef.className = "pet-hover-icon";
        fetchAsset('icons/hover', (asset) => {
            this.hoverIconRef.src = asset;
        });
        this.renderer.containerRef.appendChild(this.hoverIconRef);

        this.manager.register_event('rendered', () => {
            for (const [event, handler] of Object.entries(this.events)) {
                this.renderer.petRef.addEventListener(event, handler);
            }
            this._loop();
        });
    }

    changeState(state) {
        this.manager.debug(state);
        this.state = state;
    }

    async _loop() {
        if (this.user_interactions.length > 0) {
            await Promise.all(this.user_interactions.map(ui => ui.promise));
            this.user_interactions = [];
        }

        await new Promise((res) => setTimeout(res, Math.random() * 2000 + 1000));

        if (this.user_interactions.length > 0) {
            return this._loop();
        }

        const offset_x = Math.random() * 800 - 400;

        if (Math.abs(offset_x) > 100){
            this.changeState('walk');
            const blocked = await this.renderer.move(offset_x, 0);
            if (!blocked) {
                this.changeState('idle');
                this.renderer.render('idle');
            }
        }

        this._loop();
    }

    async _onMouseEnter() {
        this.interrupt_movement = createDeferred();
        this.renderer.interrupt_movement(this.interrupt_movement.promise);
        this.changeState('hovered');
        this.renderer.render('idle');
        this.hoverIconRef.style.opacity = "1";
    }

    async _onMouseLeave(timer=true) {
        const interrupt_movement = this.interrupt_movement;
        this.interrupt_movement = null;
        this.changeState('idle');
        if (interrupt_movement) {
            if (timer) { await new Promise((res) => setTimeout(res, Math.random() * 500 + 200)); }
            this.hoverIconRef.style.opacity = "0";
            interrupt_movement.resolve();
        }
    }

    async _onMouseDown() {
        const user_interaction = createDeferred();
        this.user_interactions.push(user_interaction);
        let velocities_x = [];
        let velocities_y = [];
        const MAX_SAMPLES = 7;

        const followMouse = (e) => {
            const rect = this.renderer.containerRef.getBoundingClientRect();
            const prev_position = { ...this.renderer.position };
            this.renderer.position.x = e.clientX - rect.width / 2 - this.renderer.min_left;
            this.renderer.position.y = window.innerHeight - e.clientY - rect.height / 2 - this.renderer.min_bottom;
            this.renderer._update_position();

            velocities_x.push(this.renderer.position.x - prev_position.x);
            velocities_y.push(this.renderer.position.y - prev_position.y);

            if (velocities_x.length > MAX_SAMPLES) { velocities_x.shift(); } 
            if (velocities_y.length > MAX_SAMPLES) { velocities_y.shift(); }
        };

        this.renderer.interrupt_movement(user_interaction.promise, true);

        document.addEventListener("mousemove", followMouse);
        document.addEventListener("mouseup", async () => {
            this.changeState('throwing');
            this.renderer.render('walk');
            document.removeEventListener("mousemove", followMouse);
            const blocked = await this.renderer.throw(velocities_x, velocities_y);
            this.manager.debug("Throw finished", blocked);

            this.changeState('idle');
            this.renderer.render('idle');

            user_interaction.resolve();
            this.user_interactions = this.user_interactions.filter(ui => ui !== user_interaction);
            if (blocked) { return; }

            this.renderer.petRef.addEventListener("mouseenter", this.events.mouseenter);
            this.renderer.petRef.addEventListener("mouseleave", this.events.mouseleave);
        }, { once: true });

        this.renderer.petRef.removeEventListener("mouseenter", this.events.mouseenter);
        this.renderer.petRef.removeEventListener("mouseleave", this.events.mouseleave);
        this.hoverIconRef.style.opacity = "0";
        this.renderer.containerRef.style.transition = "none";
        this._onMouseLeave(false);
        this.changeState('dragging');
        this.renderer.render('idle');
    }

    destroy() {
        for (const [event, handler] of Object.entries(this.events)) {
            this.renderer.petRef.removeEventListener(event, handler);
        }
    }
}



class PetManager {
    constructor(petConfig) {
        this.id = petConfig.id;
        this.name = petConfig.source + '/' + petConfig.type;
        this._callbacks = {};

        this.renderer = new PetRenderer(this, petConfig);
        this.controller = new PetController(this);

        const target = '.editor-container';
        if (document.querySelector(target)) { return this._trigger_state('ready'); }

        const obs = new MutationObserver(() => {
        if (document.querySelector(target)) {
            obs.disconnect();
            this._trigger_state('ready');
        }
        });

        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    register_event(state, fn) {
        if (!(state in this._callbacks)) {
            this._callbacks[state] = [];
        }

        this._callbacks[state].push(fn);
    }

    _trigger_state(state) {
        if (!(state in this._callbacks)) { return; }

        this._callbacks[state].forEach((cb) => cb());
    }

    debug(...messages) {
        console.debug(`%c[Walking Pets - ${this.name}]`, "color: gray;", ...messages);
    }

    log(...messages) {
        console.log(`%c[Walking Pets - ${this.name}]`, "color: gray;", ...messages);
    }

    warn(...messages) {
        console.warn(`%c[Walking Pets - ${this.name}]`, "color: gray;", ...messages);
    }

    destroy() {
        this.controller.destroy();
        this.renderer.destroy();
    }

}



class PetOrchestrator {
    // TODO handle interactions between multiple pets
    // such as fights (running into each other, ...), ...
}


const pets = {};
function connectTemporaryWS() {

    function getWorkspacePort() {
        function hash32(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = (hash * 31 + str.charCodeAt(i)) | 0;
            }
            return hash >>> 0;
        }

        const uri = vscode.context.configuration()?.workspace?.uri?.path || "noworkspace";
        const hash = hash32(uri);
        return 30000 + (hash % 10000);
    };

    function onmessage(event) {
        const data = JSON.parse(event.data); // Probably not needed to use JSON.parse for assets to speed up base64 transfers
        
        if (data.type === 'config') {
            for (const petConfig of data.pets) {
                if (petConfig.id in pets) {
                    const pet = pets[petConfig.id];
                    
                    const renderer = pet.renderer;
                    if (renderer.sizes[renderer.state] !== petConfig.sizes[renderer.state]) {
                        renderer.setHeight(petConfig.sizes[renderer.state]);
                    }
                    renderer.sizes = petConfig.sizes;

                }
                else {
                    pets[petConfig.id] = new PetManager(petConfig);
                }
            }

            const dataPetIds = data.pets.map(pc => pc.id);
            const removedPets = Object.keys(pets).filter(id => !dataPetIds.includes(Number(id)));
            for (const id of removedPets) {
                pets[id].destroy();
                delete pets[id];
            }
        }
        else if (data.type === 'asset') {
            if (!data.file || !data.content) {
                return console.error("Invalid asset data received:", data);
            }
            assets[data.file] = data.content;
        }
    };

    function connectWS(port) {
        const socket = new WebSocket(`ws://localhost:${port}`);
        socket.onmessage = onmessage;
        socket.onclose = () => { setTimeout(() => connectWS(port), 1000); };
    };

    const temporaryPort = getWorkspacePort();
    const temporarySocket = new WebSocket("ws://localhost:" + temporaryPort);
    let connected = false;

    temporarySocket.onclose = () => { 
        if (!connected) { setTimeout(connectTemporaryWS, 1000); }
    };

    temporarySocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'socket') {
            connected = true;
            connectWS(data.port);
            temporarySocket.close();
        }
    };
}

connectTemporaryWS();


