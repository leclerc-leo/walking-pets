let data = null;
let vscode = null;

/**
 * @type {Record<string, HTMLElement>}
 */
let petcards = {};

/**
 * @param {HTMLElement} app 
 * @param {string} name 
 */
function renderSubcategoryTitle(app, name, id) {
    const container = document.createElement('div');
    container.className = 'subcategory-title py-4 d-flex align-items-center';
    if (id) { container.id = id; }

    const hr1 = document.createElement('hr');
    hr1.className = 'flex-grow-1';

    const span = document.createElement('span');
    span.className = 'mx-3 text-secondary fw-bold';
    span.appendChild(document.createTextNode(name));
    
    const hr2 = document.createElement('hr');
    hr2.className = 'flex-grow-1';

    container.appendChild(hr1);
    container.appendChild(span);
    container.appendChild(hr2);

    app.appendChild(container);
}

/**
 * @param {{source: string, type: string}} pet
 * @param {string} buttonText
 */
function getPetCard(pet, buttonText) {

    const col = document.createElement('div');
    col.className = 'col-4 col-sm-3 col-md-2 col-lg-2 col-xl-1 pet-card';

    const card = document.createElement('div');
    card.className = 'card';

    const cardImgTop = document.createElement('div');
    cardImgTop.className = 'card-img-top ratio ratio-1x1';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'w-100 h-100 d-flex align-items-center justify-content-center';

    
    const petData = data.categories[pet.source].pets[pet.type];

    const petImg = document.createElement('img');
    petImg.src = data.icons['pets/' + pet.source + '/' + pet.type];
    petImg.alt = pet.source + '/' + pet.type;
    petImg.style.height = petData.idle.size * 2 + 'px';
    petImg.className = 'pet-img';

    imgContainer.appendChild(petImg);

    if (petData.background) {
        const petBackground = document.createElement('img');
        petBackground.src = data.icons['backgrounds/' + petData.background];
        petBackground.alt = 'grass';
        petBackground.className = 'pet-background';
        imgContainer.appendChild(petBackground);
    }

    cardImgTop.appendChild(imgContainer);
    card.appendChild(cardImgTop);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body ps-2 p-0 border-top';

    const cardTitle = document.createElement('div');
    cardTitle.className = 'card-title d-flex my-1';

    const titleText = document.createElement('div');
    titleText.className = 'flex-grow-1';
    const name = pet.type.split('/').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    titleText.appendChild(document.createTextNode(name));

    const petFunction = document.createElement('div');
    petFunction.className = 'px-2';
    petFunction.appendChild(document.createTextNode(buttonText));
    petFunction.style.cursor = 'pointer';
    petFunction.dataset.source = pet.source;
    petFunction.dataset.type = pet.type;
    if (pet.id !== undefined) {
        petFunction.dataset.id = pet.id;
        petcards[pet.id] = col;


        const ul = document.createElement('ul');
        ul.className = 'list-group list-group-flush';

        const li = document.createElement('li');
        li.className = 'list-group-item py-0 px-2 d-flex align-items-center justify-content-between';

        const scaleInputLabel = document.createElement('label');
        scaleInputLabel.className = 'form-label small m-0 w-50';
        scaleInputLabel.htmlFor = `scale-input-${pet.id}`;
        scaleInputLabel.appendChild(document.createTextNode('Scale: '));

        const scaleInput = document.createElement('input');
        scaleInput.type = 'number';
        scaleInput.className = 'form-control form-control-sm border-0 w-50';
        scaleInput.id = `scale-input-${pet.id}`;
        scaleInput.value = pet.scale || 100;

        li.appendChild(scaleInputLabel);
        li.appendChild(scaleInput);
        ul.appendChild(li);
        card.appendChild(ul);
    }

    cardTitle.appendChild(titleText);
    cardTitle.appendChild(petFunction);
    cardBody.appendChild(cardTitle);
    card.appendChild(cardBody);
    col.appendChild(card);
    return col;
}

/**
 * @param {HTMLElement} app 
 */
function renderPetConfiguration(app) {
    renderSubcategoryTitle(app, 'Pets');

    const row = document.createElement('div');
    row.className = 'row g-3 mb-4';
    app.appendChild(row);
    for (const pet of data.addedPets) {
        const petCard = getPetCard(pet, '🗑️');
        row.appendChild(petCard);
    }
    app.appendChild(row);

    renderSubcategoryTitle(app, 'Decorations');

    const comingSoon = document.createElement('div');
    comingSoon.className = 'text-center my-5 py-5';

    const h1 = document.createElement('h1');
    h1.className = 'display-1 fw-bold text-uppercase text-secondary';
    h1.appendChild(document.createTextNode('COMING SOON'));

    const p = document.createElement('p');
    p.className = 'lead text-muted';
    p.appendChild(document.createTextNode('🌲 Trees, grass and more! ☃️'));

    comingSoon.appendChild(h1);
    comingSoon.appendChild(p);
    app.appendChild(comingSoon);
}

/**
 * @param {HTMLElement} app 
 * @param {string} source 
 */
function renderCategory(app, source) {
    const category = data.categories[source];

    if (!category || !category.pets || category.pets.length === 0) {
        const noPets = document.createElement('div');
        noPets.className = 'text-center my-5 py-5';
        noPets.appendChild(document.createTextNode('No pets available.'));
        app.appendChild(noPets);
        return;
    }

    const pets_per_subcategory = {};
    for (const petType of Object.keys(category.pets)) {
        let subcategory = category.source + (petType.includes('/') ? '/' + petType.split('/').slice(0, -1).join('/') : '');
        if (!subcategory in Object.keys(category.categories)) {
            subcategory = category.source;
        }
        
        if (!pets_per_subcategory[subcategory]) {
            pets_per_subcategory[subcategory] = [];
        }
        pets_per_subcategory[subcategory].push(petType);
    }

    if (category.source in pets_per_subcategory) {
        const row = document.createElement('div');
        row.className = 'row g-3 mb-4';

        for (const petType of pets_per_subcategory[category.source]) {
            const pet = {
                source: category.source,
                type: petType
            };

            const petCard = getPetCard(pet, '➕');
            row.appendChild(petCard);
        }
        app.appendChild(row);
        delete pets_per_subcategory[category.source];
    }

    function renderSubcategoriesRecursively(categories, parentKey) {
        for (const subcategoryKey in categories) {
            const subcategory = categories[subcategoryKey];
            renderSubcategoryTitle(app, subcategory.name, parentKey + '/' + subcategoryKey);

            const row = document.createElement('div');
            row.className = 'row g-3 mb-4';

            for (const petType of pets_per_subcategory[parentKey + '/' + subcategoryKey] || []) {
                const pet = {
                    source: category.source,
                    type: petType
                };

                const petCard = getPetCard(pet, '➕');
                row.appendChild(petCard);
            }

            app.appendChild(row);

            renderSubcategoriesRecursively(subcategory.categories, parentKey + '/' + subcategoryKey);
        }

    }

    renderSubcategoriesRecursively(category.categories, category.source);
}

let source = null;
/**
 * @param {string} source 
 */
function render(toSource) {
    if (source === toSource) { return; }

    const app = document.getElementById('app');
    app.innerHTML = '';
    petcards = {};

    source =toSource;
    if (source === '#') {
        renderPetConfiguration(app);
    } else {
        renderCategory(app, source);
    }

    return app;
}



/**
 * @param {string} id 
 */
function scrollToSection(id) {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
}

function scrollToTop() {
    const app = document.getElementById('app');
    app.scrollTo({ top: 0, behavior: 'smooth' });
}

function createSidebar() {
    let activeElement = null;

    function recursiveCategoryBuild(source, category, parentElement) {
        if (!category.categories || Object.keys(category.categories).length === 0) { return; }

        const ul = document.createElement('ul');
        ul.className = 'nav nav-pills flex-column ms-3';
        for (const subcategoryKey in category.categories) {
            const subcategory = category.categories[subcategoryKey];
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'nav-link p-1 d-flex align-items-center';
            a.addEventListener('click', (e) => {
                activeElement?.classList.remove('active');
                a.classList.add('active');
                activeElement = a;
                render(source);
                scrollToSection(source + '/' + subcategoryKey);
            });
            a.appendChild(document.createTextNode('› ' + subcategory.name));
            li.appendChild(a);

            if (subcategory.categories) {
                recursiveCategoryBuild(source + '/' + subcategoryKey, subcategory, li);
            }

            ul.appendChild(li);
        }
        parentElement.appendChild(ul);
    }

    const sidebar = document.getElementById('sidebar');

    const categories = {
        '#': {
            name: 'Your Configuration',
            source: '#',
            categories: {}
        },
        ...data.categories,
    };

    for (const category of Object.values(categories)) {

        if (category.name !== 'Your Configuration') {
            const hr = document.createElement('hr');
            sidebar.appendChild(hr);
        }

        const ul = document.createElement('ul');
        ul.className = 'nav nav-pills flex-column';

        const li = document.createElement('li');

        const a = document.createElement('a');
        a.href = '#';
        const active = category.name === 'Your Configuration' ? 'active' : '';
        a.className = 'nav-link p-1 d-flex align-items-center ' + active;
        if (active) { activeElement = a; }
        a.addEventListener('click', (e) => {
            activeElement?.classList.remove('active');
            a.classList.add('active');
            activeElement = a;
            render(category.source);
            scrollToTop();
        });
        if (category.icon) {
            const img = document.createElement('img');
            img.src = category.icon;
            img.alt = category.name;
            img.width = 16;
            img.height = 16;
            img.className = 'bi mx-2 object-fit-contain';
            a.appendChild(img);
        }
        a.appendChild(document.createTextNode(category.name));

        li.appendChild(a);

        recursiveCategoryBuild(category.source, category, li);

        ul.appendChild(li);
        sidebar.appendChild(ul);
    }
}

function getNextAvailableId(pets) {
    const existingIds = new Set(pets.map(pet => pet.id));
    let id = 0;
    while (existingIds.has(id)) {
        id++;
    }
    return id;
}


function main() {
    createSidebar();
    app = render('#');

    app.addEventListener('click', (event) => {
        const target = event.target;
        if (!target.dataset) { return; }

        const id = target.dataset.id;
        const type = target.dataset.type;

        if (id !== undefined) {
            const col = petcards[id];
            col.remove();
            
            data.addedPets.splice(data.addedPets.findIndex(pet => pet.id === id), 1);
            return vscode.postMessage({ command: 'remove', id: id, type: type });
        }

        const petSource = target.dataset.source;

        if (!petSource || !type) { return; }

        const new_id = getNextAvailableId(data.addedPets);
        data.addedPets.push({ id: new_id, source: petSource, type: type });
        return vscode.postMessage({ command: 'add', id: new_id, source: petSource, type: type });
    });

    app.addEventListener('focusout', (event) => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        if (!target || !target.id || !target.id.startsWith('scale-input-')) { return; }

        const petId = parseInt(target.id.replace('scale-input-', ''), 10);
        let newScale = parseInt(target.value, 10);
        if (isNaN(newScale) || newScale < 0) {
            newScale = 100;
            target.value = '100';
        }

        const pet = data.addedPets.find(p => p.id === petId);
        if (pet) {
            pet.scale = newScale;
            vscode.postMessage({ command: 'updateScale', id: petId, scale: newScale });
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    vscode = acquireVsCodeApi?.() || null;

    if (vscode === null) {
        console.error("Could not acquire VSCode API");
        return;
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'initialData') { 
            data = message.data;
            main(); 
        }
    });

    vscode.postMessage({ command: 'requestInitialData' });
});
