/**
 * Pure Beauty by Yuliana Silva
 * Versión Supabase (SQL) - Sincronización silenciosa para usuarios
 */

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
    SUPABASE_URL: 'https://mnibviznwpveyvfknatt.supabase.co',
    SUPABASE_KEY: 'sb_publishable_CXGRsFZOph8h4iJy88O_2g_pnYFl72j',
    ADMIN_PASS: 'Yuli1036@',
    WHATSAPP_NUMBER: '573148849151',
    
    STORAGE_KEYS: {
        PRODUCTS: 'pb_products',
        SESSION: 'pb_admin',
        ENCARGOS: 'pb_encargos',
        DEUDORES: 'pb_deudores',
        DEUDAS: 'pb_mis_deudas',
        VENTAS: 'pb_ventas'
    }
};

// ============================================
// CLIENTE SUPABASE
// ============================================

const supabase = {
    url: CONFIG.SUPABASE_URL + '/rest/v1',
    headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },
    
    async get(table) {
        const response = await fetch(`${this.url}/${table}?select=*&order=created_at.desc`, {
            method: 'GET',
            headers: this.headers
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Error ${response.status}: ${error}`);
        }
        return await response.json();
    },
    
    async upsert(table, data) {
        const isArray = Array.isArray(data);
        
        const response = await fetch(`${this.url}/${table}`, {
            method: 'POST',
            headers: {
                ...this.headers,
                'Prefer': isArray 
                    ? 'resolution=merge-duplicates,return=representation' 
                    : 'return=representation'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Error ${response.status}: ${error}`);
        }
        return await response.json();
    },
    
    async delete(table, id) {
        const response = await fetch(`${this.url}/${table}?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: this.headers
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Error ${response.status}: ${error}`);
        }
        return true;
    }
};

// ============================================
// FUNCIONES DE PRODUCTOS (SINCRONIZACIÓN SILENCIOSA)
// ============================================

// DESCARGAR productos - SILENCIOSO para usuarios, con mensajes para admin
async function getProducts(silent = false) {
    try {
        // Solo mostrar mensaje si no es silencioso y es admin
        if (!silent && utils.isAdmin()) {
            utils.showAlert('Actualizando catalogo...', 'info');
        }
        
        const products = await supabase.get('products');
        
        // Guardar en localStorage
        localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        
        // Solo mostrar mensaje de éxito a admins y si no es silencioso
        if (!silent && utils.isAdmin()) {
            utils.showAlert(`${products.length} productos actualizados`, 'success');
        }
        
        return products;
        
    } catch (error) {
        console.error('Error cargando:', error);
        
        // Solo mostrar error a admins y si no es silencioso
        if (!silent && utils.isAdmin()) {
            utils.showAlert('Usando datos guardados localmente', 'warning');
        }
        
        // Fallback a localStorage
        return utils.getProducts();
    }
}

// SUBIR productos - SOLO PARA ADMINS
async function saveProducts(products, silent = false) {
    // Guardar localmente primero
    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    
    // Si no es admin, no subir a la nube
    if (!utils.isAdmin()) {
        return true;
    }
    
    try {
        if (!silent) {
            utils.showAlert('Guardando cambios...', 'info');
        }
        
        const data = products.map(p => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            price: parseInt(p.price) || 0,
            qty: parseInt(p.qty) || 0,
            img: p.img || '',
            updated_at: new Date().toISOString()
        }));
        
        await supabase.upsert('products', data);
        
        if (!silent) {
            utils.showAlert('Guardado en la nube', 'success');
        }
        
        return true;
        
    } catch (error) {
        console.error('Error guardando:', error);
        if (!silent) {
            utils.showAlert('Guardado local solo (sin conexion)', 'error');
        }
        return false;
    }
}

// SINCRONIZACIÓN MANUAL - Botón visible para todos pero comportamiento diferente
async function sincronizarProductos() {
    try {
        // Para admins: subir locales primero, luego descargar
        if (utils.isAdmin()) {
            const locales = utils.getProducts();
            await saveProducts(locales, false); // Con mensajes
            await getProducts(false); // Con mensajes
        } else {
            // Para usuarios: solo descargar, SIN mensajes (silencioso)
            await getProducts(true); // Silencioso = true
        }
        
        // Recargar vista para todos
        renderProducts();
        if (utils.isAdmin()) {
            updateAdminStats();
        }
        
    } catch (error) {
        console.error('Error sync:', error);
        // Solo mostrar error a admins
        if (utils.isAdmin()) {
            utils.showAlert('Error de sincronizacion', 'error');
        }
    }
}

// SINCRONIZACIÓN AUTOMÁTICA SILENCIOSA (para usuarios al cargar la página)
async function sincronizarSilencioso() {
    try {
        const products = await supabase.get('products');
        localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        renderProducts();
        console.log('Sincronización silenciosa completada:', products.length, 'productos');
    } catch (error) {
        console.error('Error en sincronización silenciosa:', error);
        // No mostrar nada al usuario, usar datos locales
    }
}

// ELIMINAR producto - SOLO ADMINS
async function deleteProductFromDB(id) {
    if (!utils.isAdmin()) {
        utils.showAlert('No tienes permiso', 'error');
        return false;
    }
    
    try {
        await supabase.delete('products', id);
        return true;
    } catch (error) {
        console.error('Error eliminando:', error);
        return false;
    }
}

// ============================================
// UTILIDADES
// ============================================

const utils = {
    generateId: () => 'p_' + Math.random().toString(36).substr(2, 9),

    formatPrice: (price) => {
        const num = parseInt(price || 0);
        return '$' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },

    formatNumber: (num) => {
        return parseInt(num || 0).toLocaleString('es-CO');
    },

    getProducts: () => {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || [];
        } catch (e) {
            return [];
        }
    },

    saveProductsLocal: (products) => {
        localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    },

    isAdmin: () => {
        return sessionStorage.getItem(CONFIG.STORAGE_KEYS.SESSION) === '1';
    },

    setAdminSession: (value) => {
        if (value) {
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, '1');
        } else {
            sessionStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
        }
        updateAdminStatus();
    },

    showAlert: (message, type = 'success') => {
        const existingAlert = document.querySelector('.floating-alert');
        if (existingAlert) existingAlert.remove();

        const alert = document.createElement('div');
        alert.className = 'floating-alert';
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 16px 24px;
            border-radius: 12px;
            font-weight: 500;
            animation: slideIn 0.3s ease;
            max-width: 400px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        `;
        alert.textContent = message;

        if (type === 'success') {
            alert.style.background = 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)';
            alert.style.color = '#1B5E20';
            alert.style.border = '1.5px solid #81C784';
        } else if (type === 'info') {
            alert.style.background = 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)';
            alert.style.color = '#0D47A1';
            alert.style.border = '1.5px solid #64B5F6';
        } else if (type === 'warning') {
            alert.style.background = 'linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)';
            alert.style.color = '#F57F17';
            alert.style.border = '1.5px solid #FFD54F';
        } else {
            alert.style.background = 'linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)';
            alert.style.color = '#B71C1C';
            alert.style.border = '1.5px solid #E57373';
        }

        document.body.appendChild(alert);

        setTimeout(() => {
            alert.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        }, 3000);
    }
};

// ============================================
// UI Y RENDERIZADO
// ============================================

function updateAdminStatus() {
    const statusText = document.getElementById('statusText');
    const adminNavLink = document.getElementById('adminNavLink');
    const headerLogout = document.getElementById('headerLogout');
    const isAdmin = utils.isAdmin();

    if (statusText) {
        statusText.textContent = isAdmin ? 'Sesion iniciada como Administrador' : 'Sesion no iniciada';
        statusText.style.color = isAdmin ? '#5A9A5A' : '#7A7A7A';
    }

    if (adminNavLink) {
        adminNavLink.style.display = isAdmin ? 'inline-block' : 'none';
    }
    
    if (headerLogout) {
        headerLogout.style.display = isAdmin ? 'inline-flex' : 'none';
    }
}

function updateAdminStats() {
    const products = utils.getProducts();
    
    const totalEl = document.getElementById('totalProducts');
    const lowStockEl = document.getElementById('lowStock');
    const outOfStockEl = document.getElementById('outOfStock');
    const totalValueEl = document.getElementById('totalValue');
    
    if (totalEl) totalEl.textContent = products.length;
    if (lowStockEl) lowStockEl.textContent = products.filter(p => p.qty > 0 && p.qty <= 5).length;
    if (outOfStockEl) outOfStockEl.textContent = products.filter(p => p.qty <= 0).length;
    
    if (totalValueEl) {
        const total = products.reduce((sum, p) => sum + (p.price * p.qty), 0);
        totalValueEl.textContent = utils.formatPrice(total);
    }
}

function renderProducts(searchTerm = '') {
    const grid = document.getElementById('productGrid');
    const emptyState = document.getElementById('emptyState');
    const productCount = document.getElementById('productCount');

    if (!grid) return;

    let products = utils.getProducts();

    // Filter products if search term is provided
    if (searchTerm && searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        products = products.filter(product =>
            product.name.toLowerCase().includes(term) ||
            product.brand.toLowerCase().includes(term)
        );
        // When searching, show flat list
        renderProductsList(products, grid, emptyState, productCount, searchTerm, false);
        return;
    }

    if (products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = 'block';
            if (searchTerm) {
                emptyState.innerHTML = `<p>No se encontraron productos que coincidan con "${searchTerm}"</p>`;
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = '';

    // Group products by brand (case-insensitive)
    const brands = {};
    products.forEach(product => {
        const brand = (product.brand || 'Sin marca').trim();
        const brandKey = brand.toLowerCase(); // Use lowercase as key
        const brandDisplay = brand; // Keep original for display
        if (!brands[brandKey]) {
            brands[brandKey] = { display: brandDisplay, products: [] };
        }
        brands[brandKey].products.push(product);
    });

    // Sort brands alphabetically (case-insensitive)
    const sortedBrands = Object.keys(brands).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    // Update product count
    if (productCount) {
        productCount.textContent = products.length + ' productos en ' + sortedBrands.length + ' marcas';
    }

    // Render products grouped by brand
    sortedBrands.forEach(brandKey => {
        const brandData = brands[brandKey];
        const brandProducts = brandData.products;
        
        // Create brand section header
        const brandHeader = document.createElement('div');
        brandHeader.className = 'brand-section-header';
        brandHeader.innerHTML = `
            <h3 style="margin: 30px 0 15px; color: var(--primary); font-size: 1.3rem; border-bottom: 2px solid var(--primary); padding-bottom: 8px;">
                ${brandData.display.toUpperCase()}
            </h3>
        `;
        grid.appendChild(brandHeader);

        // Render products for this brand
        brandProducts.forEach((product, index) => {
            const card = createProductCard(product, index);
            grid.appendChild(card);
        });
    });

    if (utils.isAdmin()) {
        updateAdminStats();
    }
}

// Helper function to render flat list (used for search)
function renderProductsList(products, grid, emptyState, productCount, searchTerm, groupedByBrand) {
    if (products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = 'block';
            if (searchTerm) {
                emptyState.innerHTML = `<p>No se encontraron productos que coincidan con "${searchTerm}"</p>`;
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = '';

    if (productCount) {
        productCount.textContent = products.length + ' productos';
    }

    products.forEach((product, index) => {
        const card = createProductCard(product, index);
        grid.appendChild(card);
    });

    if (utils.isAdmin()) {
        updateAdminStats();
    }
}

// Initialize search functionality
function initProductSearch() {
    const searchInput = document.getElementById('productSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        renderProducts(e.target.value);
    });
}

function createProductCard(product, index) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = (index * 0.05) + 's';

    const isOutOfStock = product.qty <= 0;
    const isLowStock = product.qty > 0 && product.qty <= 5;
    const defaultImg = 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80';
    const imgSrc = product.img || defaultImg;

    let badge = '';
    if (isOutOfStock) {
        badge = '<span class="card-badge out-of-stock">Agotado</span>';
    } else if (isLowStock) {
        badge = '<span class="card-badge">Ultimos</span>';
    }

    card.innerHTML = `
        <div class="card-image">
            <img src="${imgSrc}" alt="${product.name}" loading="lazy" onerror="this.src='${defaultImg}'">
            ${badge}
        </div>
        <div class="card-body">
            <div class="card-brand">${(product.brand || '').toUpperCase()}</div>
            <h3>${product.name}</h3>
            <p class="card-description">Producto de alta calidad de la marca ${product.brand}.</p>
            <div class="card-footer">
                <div class="price">${utils.formatPrice(product.price)}</div>
                <div class="stock ${isLowStock ? 'low' : ''}">
                    ${isOutOfStock ? 'Sin stock' : product.qty + ' disponibles'}
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-buy" ${isOutOfStock ? 'disabled' : ''} data-id="${product.id}">
                    ${isOutOfStock ? 'Agotado' : 'Comprar'}
                </button>
                ${utils.isAdmin() ? `
                    <button class="btn-edit" data-id="${product.id}">E</button>
                    <button class="btn-delete" data-id="${product.id}">X</button>
                ` : ''}
            </div>
        </div>
    `;
    
    const buyBtn = card.querySelector('.btn-buy');
    if (buyBtn && !isOutOfStock) {
        buyBtn.addEventListener('click', () => handleBuy(product.id));
    }
    
    if (utils.isAdmin()) {
        const editBtn = card.querySelector('.btn-edit');
        const deleteBtn = card.querySelector('.btn-delete');
        
        if (editBtn) editBtn.addEventListener('click', () => populateEditForm(product.id));
        if (deleteBtn) deleteBtn.addEventListener('click', () => handleDelete(product.id));
    }
    
    return card;
}

// ============================================
// MANEJO DE PRODUCTOS
// ============================================

async function handleDelete(productId) {
    if (!utils.isAdmin()) {
        utils.showAlert('No tienes permiso', 'error');
        return;
    }
    
    if (!confirm('¿Eliminar este producto?')) return;
    
    const products = utils.getProducts();
    const filtered = products.filter(p => p.id !== productId);
    
    const deletedFromDB = await deleteProductFromDB(productId);
    
    utils.saveProductsLocal(filtered);
    renderProducts();
    
    if (deletedFromDB) {
        utils.showAlert('Producto eliminado');
    }
}

function handleBuy(productId) {
    const products = utils.getProducts();
    const product = products.find(p => p.id === productId);
    
    if (!product || product.qty <= 0) {
        utils.showAlert('Producto agotado', 'error');
        return;
    }
    
    if (utils.isAdmin()) {
        product.qty -= 1;
        utils.saveProductsLocal(products);
        renderProducts();
    }
    
    utils.showAlert(`${product.name} agregado al pedido`);
    
    const message = `Hola Yuliana. Me interesa comprar: ${product.name} de ${product.brand} - ${utils.formatPrice(product.price)}`;
    window.open('https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message), '_blank');
}

function populateEditForm(productId) {
    if (!utils.isAdmin()) return;
    
    const products = utils.getProducts();
    const product = products.find(p => p.id === productId);
    
    if (!product) return;
    
    document.getElementById('prodId').value = product.id;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodBrand').value = product.brand;
    document.getElementById('prodPrice').value = product.price;
    document.getElementById('prodQty').value = product.qty;
    document.getElementById('prodImg').value = product.img || '';
    
    const preview = document.getElementById('prodPreview');
    if (preview && product.img) {
        preview.src = product.img;
        preview.style.display = 'block';
    }
    
    document.querySelector('.admin-grid')?.scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// FORMULARIOS
// ============================================

function initAdminForm() {
    const form = document.getElementById('adminForm');
    if (!form || !utils.isAdmin()) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const id = document.getElementById('prodId').value;
        const name = document.getElementById('prodName').value.trim();
        const brand = document.getElementById('prodBrand').value.trim();
        const price = parseInt(document.getElementById('prodPrice').value) || 0;
        const qty = parseInt(document.getElementById('prodQty').value) || 0;
        const imgInput = document.getElementById('prodImg');
        const fileInput = document.getElementById('prodImgFile');
        
        const products = utils.getProducts();
        
        async function finishWithImage(imgData) {
            const productData = {
                id: id || utils.generateId(),
                name: name,
                brand: brand,
                price: price,
                qty: qty,
                img: imgData || imgInput?.value?.trim() || ''
            };
            
            if (id) {
                const idx = products.findIndex(p => p.id === id);
                if (idx !== -1) {
                    products[idx] = productData;
                }
            } else {
                products.push(productData);
            }
            
            await saveProducts(products, false); // Con mensajes para admin
            
            renderProducts();
            form.reset();
            document.getElementById('prodId').value = '';
            
            const preview = document.getElementById('prodPreview');
            if (preview) {
                preview.style.display = 'none';
                preview.src = '';
            }
        }
        
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async function(ev) {
                await finishWithImage(ev.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            await finishWithImage(null);
        }
    });
    
    const clearBtn = document.getElementById('clearForm');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            form.reset();
            document.getElementById('prodId').value = '';
            const preview = document.getElementById('prodPreview');
            if (preview) {
                preview.style.display = 'none';
                preview.src = '';
            }
        });
    }
    
    const fileInput = document.getElementById('prodImgFile');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const file = this.files && this.files[0];
            const preview = document.getElementById('prodPreview');
            
            if (file && preview) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

function initLoginModal() {
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const closeLogin = document.getElementById('closeLogin');
    const adminPanel = document.getElementById('adminPanel');
    
    if (!loginModal) return;
    
    if (closeLogin) {
        closeLogin.addEventListener('click', () => {
            loginModal.style.display = 'none';
        });
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const pass = document.getElementById('adminPass').value;
            
            if (pass === CONFIG.ADMIN_PASS) {
                utils.setAdminSession(true);
                loginModal.style.display = 'none';
                if (adminPanel) adminPanel.style.display = 'block';
                
                getProducts(false); // Con mensajes para admin
                utils.showAlert('Bienvenida, Yuliana');
            } else {
                utils.showAlert('Contraseña incorrecta', 'error');
            }
        });
    }
    
    if (utils.isAdmin() && adminPanel) {
        adminPanel.style.display = 'block';
        getProducts(false); // Con mensajes
    } else if (!utils.isAdmin() && window.location.pathname.includes('admin.html')) {
        loginModal.style.display = 'flex';
    }
}

function initAdminActions() {
    const resetBtn = document.getElementById('resetSample');
    const logoutBtn = document.getElementById('logoutAdmin');
    const headerLogout = document.getElementById('headerLogout');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            utils.setAdminSession(false);
            utils.showAlert('Sesión cerrada');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        });
    }
    
    if (headerLogout) {
        headerLogout.style.display = utils.isAdmin() ? 'inline-flex' : 'none';
        headerLogout.addEventListener('click', function() {
            utils.setAdminSession(false);
            window.location.reload();
        });
    }
    
    if (resetBtn && utils.isAdmin()) {
        resetBtn.addEventListener('click', async function() {
            if (!confirm('¿Restaurar productos de ejemplo?')) return;
            
            const examples = [
                { id: utils.generateId(), name: 'Kit Maquillaje', brand: 'BloomShell', price: 85000, qty: 20, img: '' },
                { id: utils.generateId(), name: 'Shampoo Atenea', brand: 'Atenea', price: 29500, qty: 15, img: '' },
                { id: utils.generateId(), name: 'Serum Facial', brand: 'BloomShell', price: 45000, qty: 10, img: '' }
            ];
            
            await saveProducts(examples, false);
            renderProducts();
            utils.showAlert('Productos restaurados');
        });
    }
}

// ============================================
// ENCARGOS, DEUDORES, DEUDAS, VENTAS
// ============================================

function getEncargos() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.ENCARGOS)) || [];
    } catch (e) {
        return [];
    }
}

function saveEncargos(encargos) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.ENCARGOS, JSON.stringify(encargos));
}

function renderEncargos() {
    const list = document.getElementById('encargosList');
    if (!list) return;
    
    const encargos = getEncargos();
    
    if (encargos.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No hay encargos</p>';
        return;
    }
    
    // Group encargos by client
    const encargosPorCliente = {};
    encargos.forEach((e, i) => {
        if (!encargosPorCliente[e.cliente]) {
            encargosPorCliente[e.cliente] = [];
        }
        encargosPorCliente[e.cliente].push({ ...e, index: i });
    });
    
    list.innerHTML = Object.entries(encargosPorCliente).map(([cliente, encargosCliente]) => `
        <div style="background: var(--secondary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 16px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border); padding-bottom: 10px; margin-bottom: 12px;">
                <strong style="font-size: 1.1rem; color: var(--primary-dark);">${cliente}</strong>
                <span style="background: var(--primary); color: white; padding: 4px 12px; border-radius: var(--radius-full); font-size: 0.8rem;">${encargosCliente.length} encargo${encargosCliente.length > 1 ? 's' : ''}</span>
            </div>
            ${encargosCliente.map(e => `
                <div style="background: white; padding: 12px; border-radius: var(--radius-md); margin-bottom: 10px; border: 1.5px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                            <div style="font-size: 0.95rem; margin-bottom: 4px;">
                                <strong>Producto:</strong> ${e.producto}
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">
                                <strong>Tel:</strong> ${e.telefono || 'N/A'} | <strong>Entrega:</strong> ${e.fecha ? new Date(e.fecha).toLocaleDateString('es-CO') : 'Sin fecha'}
                            </div>
                            ${e.notas ? `<div style="font-size: 0.85rem; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); color: var(--text-muted);">${e.notas}</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                        <button onclick="editarEncargo(${e.index})" style="flex: 1; padding: 8px; background: linear-gradient(135deg, #C9A8D8 0%, #9A7AA8 100%); color: white; border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem;">Editar</button>
                        <button onclick="eliminarEncargo(${e.index})" style="padding: 8px 12px; background: #FFE5E5; color: #C95555; border: none; border-radius: var(--radius-sm); cursor: pointer;">Eliminar</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

let encargoEditando = null;

function editarEncargo(index) {
    const encargos = getEncargos();
    const encargo = encargos[index];
    if (!encargo) return;
    
    encargoEditando = index;
    
    // Fill form with encargo data
    document.getElementById('encargoCliente').value = encargo.cliente;
    document.getElementById('encargoProducto').value = encargo.producto;
    document.getElementById('encargoTelefono').value = encargo.telefono || '';
    document.getElementById('encargoFecha').value = encargo.fecha || '';
    document.getElementById('encargoNotas').value = encargo.notas || '';
    
    // Change button text
    const submitBtn = document.querySelector('#encargoForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Guardar Cambios';
        submitBtn.style.background = 'linear-gradient(135deg, #7FB89A 0%, #5A9A7A 100%)';
    }
    
    // Add cancel button if not exists
    const form = document.getElementById('encargoForm');
    let cancelBtn = document.getElementById('cancelarEdicionEncargo');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelarEdicionEncargo';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancelar Edicion';
        cancelBtn.style.cssText = 'width: 100%; margin-top: 10px; padding: 10px; background: #f0f0f0; color: var(--text); border: 2px solid var(--border); border-radius: var(--radius-md); cursor: pointer; font-weight: 500;';
        cancelBtn.onclick = cancelarEdicionEncargo;
        form.appendChild(cancelBtn);
    }
    
    // Scroll to form
    form.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicionEncargo() {
    encargoEditando = null;
    document.getElementById('encargoForm').reset();
    
    const submitBtn = document.querySelector('#encargoForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Registrar Encargo';
        submitBtn.style.background = '';
    }
    
    const cancelBtn = document.getElementById('cancelarEdicionEncargo');
    if (cancelBtn) cancelBtn.remove();
}

function eliminarEncargo(index) {
    if (!confirm('¿Eliminar este encargo?')) return;
    const encargos = getEncargos();
    encargos.splice(index, 1);
    saveEncargos(encargos);
    renderEncargos();
    
    // If editing the deleted encargo, cancel editing
    if (encargoEditando === index) {
        cancelarEdicionEncargo();
    }
}

function initEncargosForm() {
    const form = document.getElementById('encargoForm');
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const encargo = {
            cliente: document.getElementById('encargoCliente').value.trim(),
            producto: document.getElementById('encargoProducto').value.trim(),
            telefono: document.getElementById('encargoTelefono').value.trim(),
            fecha: document.getElementById('encargoFecha').value,
            notas: document.getElementById('encargoNotas').value.trim()
        };
        
        const encargos = getEncargos();
        
        if (encargoEditando !== null) {
            // Update existing encargo
            encargos[encargoEditando] = encargo;
            saveEncargos(encargos);
            renderEncargos();
            cancelarEdicionEncargo();
            utils.showAlert('Encargo actualizado correctamente');
        } else {
            // Create new encargo
            encargos.push(encargo);
            saveEncargos(encargos);
            renderEncargos();
            form.reset();
            utils.showAlert('Encargo registrado');
        }
    });
}

function getDeudores() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.DEUDORES)) || [];
    } catch (e) {
        return [];
    }
}

function saveDeudores(deudores) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.DEUDORES, JSON.stringify(deudores));
}

function renderDeudores() {
    const list = document.getElementById('deudoresList');
    const totalEl = document.getElementById('totalDeuda');
    if (!list) return;
    
    const deudores = getDeudores();
    const total = deudores.reduce((sum, d) => sum + (parseInt(d.monto) || 0), 0);
    
    if (totalEl) totalEl.textContent = utils.formatPrice(total);
    
    if (deudores.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No hay deudores</p>';
        return;
    }
    
    list.innerHTML = deudores.map((d, i) => `
        <div style="background: var(--secondary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 12px; border: 1.5px solid var(--border);">
            <div style="display: flex; justify-content: space-between;">
                <strong>${d.nombre}</strong>
                <strong style="color: var(--primary-dark);">${utils.formatPrice(d.monto)}</strong>
            </div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                <strong>Tel:</strong> ${d.telefono || 'N/A'} | ${d.fecha || 'Sin fecha'}
            </div>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button onclick="marcarPagado(${i})" style="flex: 1; padding: 8px; background: var(--primary); color: white; border: none; border-radius: var(--radius-sm); cursor: pointer;">Marcar Pagado</button>
                <button onclick="eliminarDeudor(${i})" style="padding: 8px 12px; background: #FEE; color: #C95555; border: none; border-radius: var(--radius-sm); cursor: pointer;">×</button>
            </div>
        </div>
    `).join('');
}

function eliminarDeudor(index) {
    if (!confirm('¿Eliminar deudor?')) return;
    const deudores = getDeudores();
    deudores.splice(index, 1);
    saveDeudores(deudores);
    renderDeudores();
}

function marcarPagado(index) {
    if (!confirm('¿Marcar como pagado?')) return;
    const deudores = getDeudores();
    deudores.splice(index, 1);
    saveDeudores(deudores);
    renderDeudores();
    utils.showAlert('Deuda marcada como pagada');
}

function initDeudoresForm() {
    const form = document.getElementById('deudorForm');
    if (!form) return;
    
    const fechaInput = document.getElementById('deudorFecha');
    if (fechaInput) fechaInput.valueAsDate = new Date();
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const deudor = {
            nombre: document.getElementById('deudorNombre').value.trim(),
            monto: parseInt(document.getElementById('deudorMonto').value) || 0,
            telefono: document.getElementById('deudorTelefono').value.trim(),
            fecha: document.getElementById('deudorFecha').value,
            notas: document.getElementById('deudorNotas').value.trim()
        };
        
        const deudores = getDeudores();
        deudores.push(deudor);
        saveDeudores(deudores);
        
        renderDeudores();
        form.reset();
        if (fechaInput) fechaInput.valueAsDate = new Date();
        utils.showAlert('Deuda registrada');
    });
}

function getMisDeudas() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.DEUDAS)) || [];
    } catch (e) {
        return [];
    }
}

function saveMisDeudas(deudas) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.DEUDAS, JSON.stringify(deudas));
}

function renderMisDeudas() {
    const list = document.getElementById('misDeudasList');
    const totalEl = document.getElementById('totalMiDeuda');
    if (!list) return;
    
    const deudas = getMisDeudas();
    const total = deudas.reduce((sum, d) => sum + (parseInt(d.monto) || 0), 0);
    
    if (totalEl) totalEl.textContent = utils.formatPrice(total);
    
    if (deudas.length === 0) {
        list.innerHTML = '<p style="text-align: center; padding: 20px;">No tienes deudas registradas</p>';
        return;
    }
    
    list.innerHTML = deudas.map((d, i) => `
        <div style="background: linear-gradient(135deg, #FFF5F5 0%, #FFEEEE 100%); padding: 18px; border-radius: var(--radius-md); margin-bottom: 12px; border: 2px solid #FFE5E5;">
            <div style="display: flex; justify-content: space-between;">
                <strong>${d.acreedor}</strong>
                <strong style="color: #C95555;">${utils.formatPrice(d.monto)}</strong>
            </div>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                <strong>Tel:</strong> ${d.telefono || 'N/A'}<br>
                <strong>Fecha:</strong> ${d.fecha ? new Date(d.fecha).toLocaleDateString('es-CO') : 'Sin fecha'}
                ${d.vencimiento ? `<br><strong>Vence:</strong> ${new Date(d.vencimiento).toLocaleDateString('es-CO')}` : ''}
            </div>
            ${d.notas ? `<div style="font-size: 0.85rem; margin-top: 8px; padding-top: 8px; border-top: 1px solid #FFE5E5; color: var(--text-muted);">${d.notas}</div>` : ''}
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button onclick="editarDeuda(${i})" style="flex: 1; padding: 8px; background: linear-gradient(135deg, #C9A8D8 0%, #9A7AA8 100%); color: white; border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem;">Editar</button>
                <button onclick="pagarMiDeuda(${i})" style="flex: 1; padding: 8px; background: linear-gradient(135deg, #7FB89A 0%, #5A9A7A 100%); color: white; border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem;">Marcar Pagada</button>
                <button onclick="eliminarMiDeuda(${i})" style="padding: 8px 12px; background: #FFE5E5; color: #C95555; border: none; border-radius: var(--radius-sm); cursor: pointer;">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function eliminarMiDeuda(index) {
    if (!confirm('¿Eliminar deuda?')) return;
    const deudas = getMisDeudas();
    deudas.splice(index, 1);
    saveMisDeudas(deudas);
    renderMisDeudas();
}

function pagarMiDeuda(index) {
    if (!confirm('¿Marcar como pagada?')) return;
    const deudas = getMisDeudas();
    deudas.splice(index, 1);
    saveMisDeudas(deudas);
    renderMisDeudas();
    utils.showAlert('Deuda pagada');
}

function initMisDeudasForm() {
    const form = document.getElementById('miDeudaForm');
    if (!form) return;
    
    const fechaInput = document.getElementById('miDeudaFecha');
    if (fechaInput) fechaInput.valueAsDate = new Date();
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const deuda = {
            acreedor: document.getElementById('acreedorNombre').value.trim(),
            monto: parseInt(document.getElementById('miDeudaMonto').value) || 0,
            telefono: document.getElementById('miDeudaTelefono').value.trim(),
            fecha: document.getElementById('miDeudaFecha').value,
            vencimiento: document.getElementById('miDeudaVencimiento').value,
            notas: document.getElementById('miDeudaNotas').value.trim()
        };
        
        const deudas = getMisDeudas();
        
        if (deudaEditando !== null) {
            // Update existing deuda
            deudas[deudaEditando] = deuda;
            saveMisDeudas(deudas);
            renderMisDeudas();
            cancelarEdicionDeuda();
            utils.showAlert('Deuda actualizada correctamente');
        } else {
            // Create new deuda
            deudas.push(deuda);
            saveMisDeudas(deudas);
            renderMisDeudas();
            form.reset();
            if (fechaInput) fechaInput.valueAsDate = new Date();
            utils.showAlert('Deuda registrada');
        }
    });
}

let deudaEditando = null;

function editarDeuda(index) {
    const deudas = getMisDeudas();
    const deuda = deudas[index];
    if (!deuda) return;
    
    deudaEditando = index;
    
    // Fill form with deuda data
    document.getElementById('acreedorNombre').value = deuda.acreedor;
    document.getElementById('miDeudaMonto').value = deuda.monto;
    document.getElementById('miDeudaTelefono').value = deuda.telefono || '';
    document.getElementById('miDeudaFecha').value = deuda.fecha || '';
    document.getElementById('miDeudaVencimiento').value = deuda.vencimiento || '';
    document.getElementById('miDeudaNotas').value = deuda.notas || '';
    
    // Change button text
    const submitBtn = document.querySelector('#miDeudaForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Guardar Cambios';
        submitBtn.style.background = 'linear-gradient(135deg, #7FB89A 0%, #5A9A7A 100%)';
    }
    
    // Add cancel button if not exists
    let cancelBtn = document.getElementById('cancelarEdicionDeuda');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelarEdicionDeuda';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancelar Edicion';
        cancelBtn.style.cssText = 'width: 100%; margin-top: 10px; padding: 10px; background: #f0f0f0; color: var(--text); border: 2px solid var(--border); border-radius: var(--radius-md); cursor: pointer; font-weight: 500;';
        cancelBtn.onclick = cancelarEdicionDeuda;
        form.appendChild(cancelBtn);
    }
    
    // Scroll to form
    form.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicionDeuda() {
    deudaEditando = null;
    const form = document.getElementById('miDeudaForm');
    form.reset();
    
    const fechaInput = document.getElementById('miDeudaFecha');
    if (fechaInput) fechaInput.valueAsDate = new Date();
    
    const submitBtn = document.querySelector('#miDeudaForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Registrar Deuda';
        submitBtn.style.background = '';
    }
    
    const cancelBtn = document.getElementById('cancelarEdicionDeuda');
    if (cancelBtn) cancelBtn.remove();
}

function getVentas() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.VENTAS)) || [];
    } catch (e) {
        return [];
    }
}

function saveVentas(ventas) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.VENTAS, JSON.stringify(ventas));
}

function renderVentas() {
    const list = document.getElementById('ventasList');
    const totalHoyEl = document.getElementById('totalVentaHoy');
    const totalSemanaEl = document.getElementById('totalVentaSemana');
    const totalMesEl = document.getElementById('totalVentaMes');
    
    if (!list) return;
    
    const ventas = getVentas();
    const hoy = new Date().toISOString().split('T')[0];
    
    const totalHoy = ventas
        .filter(v => v.fecha === hoy)
        .reduce((sum, v) => sum + (parseInt(v.monto) || 0), 0);
    
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 6);
    const totalSemana = ventas
        .filter(v => new Date(v.fecha) >= hace7Dias)
        .reduce((sum, v) => sum + (parseInt(v.monto) || 0), 0);
    
    const mesActual = hoy.substring(0, 7);
    const totalMes = ventas
        .filter(v => v.fecha && v.fecha.startsWith(mesActual))
        .reduce((sum, v) => sum + (parseInt(v.monto) || 0), 0);
    
    if (totalHoyEl) totalHoyEl.textContent = utils.formatPrice(totalHoy);
    if (totalSemanaEl) totalSemanaEl.textContent = utils.formatPrice(totalSemana);
    if (totalMesEl) totalMesEl.textContent = utils.formatPrice(totalMes);
    
    if (ventas.length === 0) {
        list.innerHTML = '<p style="text-align: center; padding: 20px;">No hay ventas registradas</p>';
        return;
    }
    
    const ventasPorDia = {};
    ventas.forEach(v => {
        if (!ventasPorDia[v.fecha]) ventasPorDia[v.fecha] = [];
        ventasPorDia[v.fecha].push(v);
    });
    
    const fechasOrdenadas = Object.keys(ventasPorDia).sort((a, b) => new Date(b) - new Date(a));
    
    list.innerHTML = fechasOrdenadas.map(fecha => {
        const ventasDelDia = ventasPorDia[fecha];
        const totalDelDia = ventasDelDia.reduce((sum, v) => sum + (parseInt(v.monto) || 0), 0);
        const esHoy = fecha === hoy;
        
        const fechaFormateada = new Date(fecha).toLocaleDateString('es-CO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        return `
            <div style="background: ${esHoy ? 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)' : 'var(--secondary)'}; padding: 12px 16px; border-radius: var(--radius-md); margin-bottom: 12px; margin-top: 20px; border: 2px solid ${esHoy ? '#81C784' : 'var(--border)'}; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 600; text-transform: capitalize;">
                    ${esHoy ? 'Hoy - ' : ''}${fechaFormateada}
                </div>
                <div style="font-weight: 700; color: ${esHoy ? '#1B5E20' : 'var(--primary-dark)'};">
                    ${utils.formatPrice(totalDelDia)}
                </div>
            </div>
            ${ventasDelDia.map((v, idx) => {
                const originalIndex = ventas.indexOf(v);
                return `
                    <div style="background: white; padding: 14px 16px; border-radius: var(--radius-md); margin-bottom: 8px; border: 1.5px solid var(--border); margin-left: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <strong>${v.producto}</strong>
                            <strong style="color: var(--primary-dark);">${utils.formatPrice(v.monto)}</strong>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">
                            <strong>Cantidad:</strong> ${v.cantidad} | <strong>Precio unitario:</strong> ${utils.formatPrice(v.precioUnitario)}
                        </div>
                        ${v.cliente ? `<div style="font-size: 0.85rem; color: var(--text-muted);"><strong>Cliente:</strong> ${v.cliente}</div>` : ''}
                        <div style="margin-top: 8px; text-align: right;">
                            <button onclick="eliminarVenta(${originalIndex})" style="padding: 5px 10px; background: #FFEBEE; color: #C62828; border: none; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.75rem;">Eliminar</button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }).join('');
}

function eliminarVenta(index) {
    if (!confirm('¿Eliminar venta?')) return;
    const ventas = getVentas();
    ventas.splice(index, 1);
    saveVentas(ventas);
    renderVentas();
}

function initVentasForm() {
    const form = document.getElementById('ventaForm');
    if (!form) return;
    
    const fechaInput = document.getElementById('ventaFecha');
    if (fechaInput) fechaInput.valueAsDate = new Date();
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const cantidad = parseInt(document.getElementById('ventaCantidad').value) || 1;
        const precioUnitario = parseInt(document.getElementById('ventaMonto').value) || 0;
        const total = precioUnitario * cantidad;
        
        const venta = {
            fecha: document.getElementById('ventaFecha').value,
            producto: document.getElementById('ventaProducto').value.trim(),
            cantidad: cantidad,
            precioUnitario: precioUnitario,
            monto: total,
            cliente: document.getElementById('ventaCliente').value.trim(),
            notas: document.getElementById('ventaNotas').value.trim(),
            fechaRegistro: new Date().toISOString()
        };
        
        const ventas = getVentas();
        ventas.push(venta);
        saveVentas(ventas);
        
        renderVentas();
        form.reset();
        if (fechaInput) fechaInput.valueAsDate = new Date();
        utils.showAlert(`Venta registrada. Total: ${utils.formatPrice(total)}`);
    });
}

// ============================================
// ACCESO SECRETO AL ADMIN
// ============================================

function initSecretAdminAccess() {
    const logo = document.getElementById('secretLogo');
    if (!logo) return;
    
    let clickCount = 0;
    let lastClickTime = 0;
    const requiredClicks = 5;
    const timeWindow = 3000;
    
    logo.addEventListener('click', function(e) {
        if (e.target.closest('a') || e.target.closest('button')) return;
        
        const currentTime = new Date().getTime();
        
        if (currentTime - lastClickTime > timeWindow) {
            clickCount = 0;
        }
        
        clickCount++;
        lastClickTime = currentTime;
        
        logo.classList.add('secret-active');
        setTimeout(() => logo.classList.remove('secret-active'), 300);
        
        if (clickCount >= requiredClicks) {
            clickCount = 0;
            const modal = document.getElementById('adminAccessModal');
            if (modal) {
                modal.style.display = 'flex';
            }
        }
    });
    
    const accessForm = document.getElementById('adminAccessForm');
    if (accessForm) {
        accessForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const pass = document.getElementById('adminAccessPass').value;
            
            if (pass === CONFIG.ADMIN_PASS) {
                utils.setAdminSession(true);
                window.location.href = 'admin.html';
            } else {
                utils.showAlert('Contraseña incorrecta', 'error');
                document.getElementById('adminAccessPass').value = '';
            }
        });
    }
    
    const closeBtn = document.getElementById('closeAdminAccess');
    const cancelBtn = document.getElementById('adminAccessCancel');
    const modal = document.getElementById('adminAccessModal');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Actualizar estado admin
    updateAdminStatus();
    
    // Renderizar todo (con datos locales primero para velocidad)
    renderProducts();
    initProductSearch(); // Inicializar busqueda de productos
    renderEncargos();
    renderDeudores();
    renderMisDeudas();
    renderVentas();
    
    // Inicializar formularios
    initAdminForm();
    initLoginModal();
    initAdminActions();
    initEncargosForm();
    initDeudoresForm();
    initMisDeudasForm();
    initVentasForm();
    initSecretAdminAccess();
    
    // SINCRONIZACIÓN SILENCIOSA EN SEGUNDO PLANO
    // Primero intentamos cargar de Supabase silenciosamente (más rápido)
    // Si falla, usamos los datos locales que ya se mostraron
    if (utils.isAdmin()) {
        // Admin: sincronización con mensajes
        getProducts(false);
    } else {
        // Usuario: sincronización silenciosa en segundo plano
        // Usamos setTimeout para no bloquear la carga de la página
        setTimeout(() => {
            sincronizarSilencioso();
        }, 100); // Pequeño delay para que la página cargue primero
    }
    
    // CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
});

// Cerrar modales al hacer clic fuera
window.addEventListener('click', function(e) {
    const loginModal = document.getElementById('loginModal');
    const adminAccessModal = document.getElementById('adminAccessModal');
    if (e.target === loginModal) {
        loginModal.style.display = 'none';
    }
    if (e.target === adminAccessModal) {
        adminAccessModal.style.display = 'none';
    }
});
