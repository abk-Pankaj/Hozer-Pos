const storageKeys = {
  items: "storefront-pos-items",
  orders: "storefront-pos-orders",
  drafts: "storefront-pos-drafts",
  bookings: "storefront-pos-bookings",
  settings: "storefront-pos-settings",
  demoCleanup: "storefront-pos-demo-cleanup-v1",
  session: "storefront-pos-session"
};

const backupVersion = 1;
const defaultCategories = ["Beverages", "Food", "Bakery", "Retail", "ROOM"];
const demoItemIds = new Set(["item-1", "item-2", "item-3", "item-4", "item-5", "item-6", "item-7", "item-8"]);
const demoOrderIds = new Set(["BILL-1001", "BILL-1002", "BILL-1003", "BILL-1004", "BILL-1005", "BILL-1006"]);

const state = {
  items: [],
  orders: [],
  drafts: [],
  bookings: [],
  cart: [],
  selectedCategory: "All",
  selectedPayment: "Cash",
  activeView: "dashboardView",
  settings: {
    businessName: "Hozer POS",
    footer: "Thank you for shopping with us",
    currency: "$",
    taxRate: 8,
    address: "Main Street, Local Market",
    loginUsername: "admin",
    loginPasswordHash: ""
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `${state.settings.currency}${Number(value || 0).toFixed(2)}`;
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function loadState() {
  state.settings = { ...state.settings, ...read(storageKeys.settings, {}) };
  state.items = read(storageKeys.items, []);
  state.orders = read(storageKeys.orders, []);
  state.drafts = read(storageKeys.drafts, []);
  state.bookings = read(storageKeys.bookings, []);
  ensureLoginDefaults();

  if (!localStorage.getItem(storageKeys.demoCleanup)) {
    removeSavedDemoData();
  }
}

function ensureLoginDefaults() {
  let changed = false;
  if (!state.settings.loginUsername) {
    state.settings.loginUsername = "admin";
    changed = true;
  }
  if (!state.settings.loginPasswordHash) {
    state.settings.loginPasswordHash = hashText("1234");
    changed = true;
  }
  if (changed) {
    save(storageKeys.settings, state.settings);
  }
}

function removeSavedDemoData() {
  state.items = state.items.filter((item) => !demoItemIds.has(item.id));
  state.orders = state.orders.filter((order) => {
    const usesDemoItems = (order.items || []).some((item) => demoItemIds.has(item.id));
    return !demoOrderIds.has(order.id) && !usesDemoItems;
  });
  state.drafts = state.drafts
    .map((draft) => ({
      ...draft,
      items: (draft.items || []).filter((item) => !demoItemIds.has(item.id))
    }))
    .filter((draft) => draft.items.length);
  persistAll();
  localStorage.setItem(storageKeys.demoCleanup, "true");
}

function persistAll() {
  save(storageKeys.items, state.items);
  save(storageKeys.orders, state.orders);
  save(storageKeys.drafts, state.drafts);
  save(storageKeys.bookings, state.bookings);
  save(storageKeys.settings, state.settings);
}

function renderAll() {
  renderShell();
  renderDashboard();
  renderCategories();
  renderProducts();
  renderCart();
  renderItemsTable();
  renderOrders();
  renderDrafts();
  renderBookings();
  renderSettings();
}

function renderShell() {
  $("#brandName").textContent = state.settings.businessName;
  $("#brandTagline").textContent = state.settings.address || "Small business checkout";
  $("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());

  const pageTitles = {
    dashboardView: "Dashboard",
    posView: "Point of Sale",
    itemsView: "Menu & Item Management",
    ordersView: "Bills & Sales History",
    draftsView: "Order Drafts",
    bookingsView: "Room Booking",
    settingsView: "Settings"
  };
  $("#pageTitle").textContent = pageTitles[state.activeView] || "Dashboard";
  $("#draftCount").textContent = state.drafts.length;
  $("#bookingCount").textContent = state.bookings.filter((booking) => !["Checked Out", "Cancelled"].includes(booking.status)).length;
  $("#drawerTotal").textContent = money(todayOrders().filter((order) => order.payment === "Cash").reduce((sum, order) => sum + order.total, 0));
}

function todayOrders() {
  const key = todayKey();
  return state.orders.filter((order) => todayKey(new Date(order.createdAt)) === key);
}

function cartTotals(cart = state.cart) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountValue = Number($("#discountValue")?.value || 0);
  const discountType = $("#discountType")?.value || "percent";
  const rawDiscount = discountType === "percent" ? subtotal * (discountValue / 100) : discountValue;
  const discount = Math.min(subtotal, Math.max(0, rawDiscount));
  const taxable = subtotal - discount;
  const taxRate = Number($("#taxRate")?.value || 0);
  const tax = taxable * (Math.max(0, taxRate) / 100);
  const total = taxable + tax;
  return { subtotal, discount, tax, total };
}

function renderDashboard() {
  const orders = todayOrders();
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const avg = orders.length ? revenue / orders.length : 0;
  $("#metricRevenue").textContent = money(revenue);
  $("#metricRevenueSub").textContent = `${orders.length} sale${orders.length === 1 ? "" : "s"} today`;
  $("#metricOrders").textContent = orders.length;
  $("#metricOrdersSub").textContent = `${state.orders.length} bills total`;
  $("#metricAvg").textContent = money(avg);
  $("#metricDrafts").textContent = state.drafts.length;
  drawSalesChart();
  renderTopItems();
  renderRecentBills();
  renderStockWatch();
}

function drawSalesChart() {
  const canvas = $("#salesChart");
  const ctx = canvas.getContext("2d");
  const days = Number($("#salesRange").value || 7);
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 24, right: 28, bottom: 42, left: 60 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const points = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = todayKey(date);
    const total = state.orders
      .filter((order) => todayKey(new Date(order.createdAt)) === key)
      .reduce((sum, order) => sum + order.total, 0);
    points.push({ label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), total });
  }

  const max = Math.max(...points.map((point) => point.total), 20);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d9dfd8";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#697570";
  ctx.font = "14px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartHeight / 4) * i;
    const value = max - (max / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(money(value), pad.left - 12, y);
  }

  const barGap = Math.min(18, chartWidth / points.length / 2.8);
  const barWidth = Math.max(18, chartWidth / points.length - barGap);
  points.forEach((point, index) => {
    const x = pad.left + index * (chartWidth / points.length) + barGap / 2;
    const barHeight = Math.max(3, (point.total / max) * chartHeight);
    const y = pad.top + chartHeight - barHeight;
    ctx.fillStyle = "#146c63";
    roundedRect(ctx, x, y, barWidth, barHeight, 7);
    ctx.fill();
    ctx.fillStyle = "#697570";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(point.label, x + barWidth / 2, pad.top + chartHeight + 14);
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderTopItems() {
  const soldMap = new Map();
  state.orders.forEach((order) => {
    order.items.forEach((line) => {
      soldMap.set(line.id, (soldMap.get(line.id) || 0) + line.qty);
    });
  });

  const ranked = [...state.items]
    .map((item) => ({ ...item, actualSold: (soldMap.get(item.id) || 0) + (item.sold || 0) }))
    .sort((a, b) => b.actualSold - a.actualSold)
    .slice(0, 5);

  $("#topItemsList").innerHTML = ranked.length ? ranked.map((item, index) => `
    <div class="rank-row">
      <span class="rank-dot" style="background:${item.color}">${index + 1}</span>
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)}</span></div>
      <strong>${item.actualSold}</strong>
    </div>
  `).join("") : emptyBlock("No sales yet");
}

function renderRecentBills() {
  const rows = state.orders.slice(0, 5).map((order) => `
    <tr>
      <td>${order.id}</td>
      <td>${money(order.total)}</td>
      <td><span class="status-pill">${order.status}</span></td>
    </tr>
  `).join("");
  $("#recentBills").innerHTML = rows || `<tr><td colspan="3" class="empty-row">No bills generated yet</td></tr>`;
}

function renderStockWatch() {
  const rows = [...state.items]
    .filter((item) => Number(item.stock) <= Number(item.reorder || 0) + 3)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5)
    .map((item) => `
      <div class="rank-row">
        <span class="rank-dot" style="background:${item.color}">${initials(item.name)}</span>
        <div><strong>${escapeHtml(item.name)}</strong><span>Reorder at ${item.reorder || 0}</span></div>
        <strong class="${item.stock <= (item.reorder || 0) ? "danger-text" : ""}">${item.stock}</strong>
      </div>
    `).join("");
  $("#stockWatch").innerHTML = rows || emptyBlock("Stock levels look good");
}

function renderCategories() {
  const categories = ["All", ...new Set([...defaultCategories, ...state.items.map((item) => item.category)].filter(Boolean))];
  if (!categories.includes(state.selectedCategory)) state.selectedCategory = "All";
  $("#categoryTabs").innerHTML = categories.map((category) => `
    <button class="category-tab ${category === state.selectedCategory ? "active" : ""}" data-category="${escapeAttr(category)}">${escapeHtml(category)}</button>
  `).join("");
  $("#categoryOptions").innerHTML = categories
    .filter((category) => category !== "All")
    .map((category) => `<option value="${escapeAttr(category)}"></option>`)
    .join("");
}

function filteredProducts() {
  const query = $("#productSearch").value.trim().toLowerCase();
  const sort = $("#sortProducts").value;
  const items = state.items.filter((item) => {
    const categoryMatch = state.selectedCategory === "All" || item.category === state.selectedCategory;
    const searchMatch = [item.name, item.sku, item.category].join(" ").toLowerCase().includes(query);
    return categoryMatch && searchMatch && item.active;
  });
  return items.sort((a, b) => {
    if (sort === "popular") return (b.sold || 0) - (a.sold || 0);
    if (sort === "stock") return Number(a.stock) - Number(b.stock);
    return a.name.localeCompare(b.name);
  });
}

function renderProducts() {
  const products = filteredProducts();
  $("#productGrid").innerHTML = products.length ? products.map((item) => {
    const inCart = state.cart.find((line) => line.id === item.id)?.qty || 0;
    const available = item.stock - inCart;
    return `
      <button class="product-card" data-add-item="${item.id}" ${available <= 0 ? "disabled" : ""}>
        <div>
          <div class="product-top">
            <span class="item-chip" style="background:${item.color}">${initials(item.name)}</span>
            <span class="status-pill ${available <= item.reorder ? "muted" : ""}">${available} left</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.category)} - ${escapeHtml(item.sku)}</p>
        </div>
        <div class="product-bottom">
          <span class="price-text">${money(item.price)}</span>
          <span class="stock-text">${available <= 0 ? "Out of stock" : "Click to add"}</span>
        </div>
      </button>
    `;
  }).join("") : emptyBlock("No active items match this search");
}

function addToCart(itemId) {
  const item = state.items.find((product) => product.id === itemId);
  if (!item || !item.active) return;
  const existing = state.cart.find((line) => line.id === itemId);
  const currentQty = existing?.qty || 0;
  if (currentQty >= item.stock) {
    toast("No more stock available for this item");
    return;
  }
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category,
      color: item.color,
      price: Number(item.price),
      qty: 1
    });
  }
  renderProducts();
  renderCart();
}

function updateCartQty(itemId, delta) {
  const line = state.cart.find((item) => item.id === itemId);
  const stockItem = state.items.find((item) => item.id === itemId);
  if (!line || !stockItem) return;
  const nextQty = line.qty + delta;
  if (nextQty <= 0) {
    state.cart = state.cart.filter((item) => item.id !== itemId);
  } else if (nextQty <= stockItem.stock) {
    line.qty = nextQty;
  } else {
    toast("Quantity is limited by available stock");
  }
  renderProducts();
  renderCart();
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  $("#cartMeta").textContent = count ? `${count} item${count === 1 ? "" : "s"} in cart` : "No items added";

  $("#cartItems").innerHTML = state.cart.length ? state.cart.map((item) => `
    <div class="cart-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${money(item.price)} each - ${escapeHtml(item.sku)}</small>
      </div>
      <div>
        <strong>${money(item.price * item.qty)}</strong>
        <div class="qty-stepper" aria-label="Quantity controls">
          <button data-cart-dec="${item.id}" title="Decrease quantity"><svg><use href="#i-minus"></use></svg></button>
          <span>${item.qty}</span>
          <button data-cart-inc="${item.id}" title="Increase quantity"><svg><use href="#i-plus"></use></svg></button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Click an item to add it to this order</div>`;

  const totals = cartTotals();
  $("#subtotalText").textContent = money(totals.subtotal);
  $("#discountText").textContent = `-${money(totals.discount)}`;
  $("#taxText").textContent = money(totals.tax);
  $("#totalText").textContent = money(totals.total);
}

function clearCart() {
  state.cart = [];
  $("#customerName").value = "";
  $("#customerPhone").value = "";
  $("#discountValue").value = 0;
  $("#discountType").value = "percent";
  $("#taxRate").value = state.settings.taxRate;
  state.selectedPayment = "Cash";
  setPaymentButtons();
  renderProducts();
  renderCart();
}

function holdDraft() {
  if (!state.cart.length) {
    toast("Add at least one item before holding a draft");
    return;
  }

  const totals = cartTotals();
  state.drafts.unshift({
    id: uid("draft"),
    createdAt: new Date().toISOString(),
    customerName: $("#customerName").value.trim() || "Walk-in customer",
    customerPhone: $("#customerPhone").value.trim(),
    items: structuredClone(state.cart),
    discountValue: Number($("#discountValue").value || 0),
    discountType: $("#discountType").value,
    taxRate: Number($("#taxRate").value || 0),
    payment: state.selectedPayment,
    total: totals.total
  });
  save(storageKeys.drafts, state.drafts);
  clearCart();
  renderAll();
  toast("Order saved as draft");
}

function checkout() {
  if (!state.cart.length) {
    toast("Add items before generating a bill");
    return;
  }

  const missingStock = state.cart.find((line) => {
    const item = state.items.find((product) => product.id === line.id);
    return !item || line.qty > item.stock;
  });

  if (missingStock) {
    toast(`${missingStock.name} does not have enough stock`);
    return;
  }

  const totals = cartTotals();
  const order = {
    id: nextBillId(),
    createdAt: new Date().toISOString(),
    customerName: $("#customerName").value.trim() || "Walk-in customer",
    customerPhone: $("#customerPhone").value.trim(),
    items: structuredClone(state.cart),
    payment: state.selectedPayment,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    status: "Paid",
    footer: state.settings.footer
  };

  order.items.forEach((line) => {
    const item = state.items.find((product) => product.id === line.id);
    if (item) {
      item.stock = Math.max(0, Number(item.stock) - Number(line.qty));
      item.sold = Number(item.sold || 0) + Number(line.qty);
    }
  });

  state.orders.unshift(order);
  persistAll();
  clearCart();
  renderAll();
  showReceipt(order);
  toast(`Bill ${order.id} generated`);
}

function nextBillId() {
  const numbers = state.orders
    .map((order) => Number(String(order.id).replace(/\D/g, "")))
    .filter(Boolean);
  const next = Math.max(1000, ...numbers) + 1;
  return `BILL-${next}`;
}

function renderItemsTable() {
  const query = $("#itemSearch").value.trim().toLowerCase();
  const rows = state.items
    .filter((item) => [item.name, item.sku, item.category].join(" ").toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => `
      <tr>
        <td>
          <div class="item-name-cell">
            <span class="item-chip" style="background:${item.color}">${initials(item.name)}</span>
            <div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.sku)}</small></div>
          </div>
        </td>
        <td>${escapeHtml(item.category)}</td>
        <td>${money(item.price)}</td>
        <td class="${item.stock <= (item.reorder || 0) ? "danger-text" : ""}">${item.stock}</td>
        <td><span class="status-pill ${item.active ? "" : "muted"}">${item.active ? "Active" : "Hidden"}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit-item="${item.id}" title="Edit item"><svg><use href="#i-edit"></use></svg></button>
            <button class="icon-btn" data-delete-item="${item.id}" title="Delete item"><svg><use href="#i-trash"></use></svg></button>
          </div>
        </td>
      </tr>
    `).join("");

  $("#itemsTable").innerHTML = rows || `<tr><td colspan="6" class="empty-row">No catalog items found</td></tr>`;
  $("#itemCountLabel").textContent = `${state.items.length} item${state.items.length === 1 ? "" : "s"}`;
}

function saveItem(event) {
  event.preventDefault();
  const id = $("#itemId").value || uid("item");
  const payload = {
    id,
    name: $("#itemName").value.trim(),
    sku: $("#itemSku").value.trim(),
    category: $("#itemCategory").value.trim(),
    price: Number($("#itemPrice").value || 0),
    cost: Number($("#itemCost").value || 0),
    stock: Number($("#itemStock").value || 0),
    reorder: Number($("#itemReorder").value || 0),
    color: $("#itemColor").value,
    active: $("#itemActive").checked,
    sold: Number(state.items.find((item) => item.id === id)?.sold || 0)
  };

  const index = state.items.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.items[index] = payload;
  } else {
    state.items.push(payload);
  }
  save(storageKeys.items, state.items);
  resetItemForm();
  renderAll();
  toast("Item saved");
}

function editItem(id) {
  const item = state.items.find((product) => product.id === id);
  if (!item) return;
  $("#itemFormTitle").textContent = "Edit Menu Item";
  $("#itemId").value = item.id;
  $("#itemName").value = item.name;
  $("#itemSku").value = item.sku;
  $("#itemCategory").value = item.category;
  $("#itemPrice").value = item.price;
  $("#itemCost").value = item.cost || 0;
  $("#itemStock").value = item.stock;
  $("#itemReorder").value = item.reorder || 0;
  $("#itemColor").value = item.color || "#146c63";
  $("#itemActive").checked = Boolean(item.active);
  $("#itemName").focus();
}

function deleteItem(id) {
  const item = state.items.find((product) => product.id === id);
  if (!item) return;
  const soldBefore = state.orders.some((order) => order.items.some((line) => line.id === id));
  const inCart = state.cart.some((line) => line.id === id);

  if (soldBefore || inCart) {
    item.active = false;
    toast("Item has sales history, so it was hidden instead of deleted");
  } else {
    state.items = state.items.filter((product) => product.id !== id);
    toast("Item deleted");
  }

  save(storageKeys.items, state.items);
  renderAll();
}

function resetItemForm() {
  $("#itemForm").reset();
  $("#itemId").value = "";
  $("#itemColor").value = "#1b9aaa";
  $("#itemActive").checked = true;
  $("#itemFormTitle").textContent = "Add Menu Item";
}

function renderOrders() {
  const query = $("#orderSearch").value.trim().toLowerCase();
  const payment = $("#orderPaymentFilter").value;
  const rows = state.orders
    .filter((order) => {
      const matchesQuery = [order.id, order.customerName, order.customerPhone].join(" ").toLowerCase().includes(query);
      const matchesPayment = payment === "All" || order.payment === payment;
      return matchesQuery && matchesPayment;
    })
    .map((order) => `
      <tr>
        <td><strong>${order.id}</strong></td>
        <td>${formatDateTime(order.createdAt)}</td>
        <td>${escapeHtml(order.customerName)}</td>
        <td>${order.items.reduce((sum, item) => sum + item.qty, 0)}</td>
        <td>${order.payment}</td>
        <td><strong>${money(order.total)}</strong></td>
        <td><button class="ghost-btn" data-view-receipt="${order.id}"><svg><use href="#i-receipt"></use></svg><span>View</span></button></td>
      </tr>
    `).join("");
  $("#ordersTable").innerHTML = rows || `<tr><td colspan="7" class="empty-row">No bills match this filter</td></tr>`;
}

function renderDrafts() {
  $("#draftGrid").innerHTML = state.drafts.length ? state.drafts.map((draft) => `
    <article class="draft-card">
      <h3>${escapeHtml(draft.customerName)}</h3>
      <p>${formatDateTime(draft.createdAt)}</p>
      <dl>
        <div><dt>Items</dt><dd>${draft.items.reduce((sum, item) => sum + item.qty, 0)}</dd></div>
        <div><dt>Payment</dt><dd>${draft.payment}</dd></div>
        <div><dt>Total</dt><dd>${money(draft.total)}</dd></div>
      </dl>
      <div class="cart-actions">
        <button class="ghost-btn" data-delete-draft="${draft.id}"><svg><use href="#i-trash"></use></svg><span>Delete</span></button>
        <button class="primary-btn" data-resume-draft="${draft.id}"><svg><use href="#i-pos"></use></svg><span>Resume</span></button>
      </div>
    </article>
  `).join("") : `<div class="empty-state">No held orders yet</div>`;
}

function resumeDraft(id) {
  const draft = state.drafts.find((entry) => entry.id === id);
  if (!draft) return;
  state.cart = structuredClone(draft.items);
  $("#customerName").value = draft.customerName === "Walk-in customer" ? "" : draft.customerName;
  $("#customerPhone").value = draft.customerPhone || "";
  $("#discountValue").value = draft.discountValue || 0;
  $("#discountType").value = draft.discountType || "percent";
  $("#taxRate").value = draft.taxRate ?? state.settings.taxRate;
  state.selectedPayment = draft.payment || "Cash";
  setPaymentButtons();
  state.drafts = state.drafts.filter((entry) => entry.id !== id);
  save(storageKeys.drafts, state.drafts);
  switchView("posView");
  renderAll();
  toast("Draft resumed");
}

function deleteDraft(id) {
  state.drafts = state.drafts.filter((draft) => draft.id !== id);
  save(storageKeys.drafts, state.drafts);
  renderAll();
  toast("Draft deleted");
}

function bookingNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const dayMs = 24 * 60 * 60 * 1000;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.ceil((end - start) / dayMs));
}

function bookingTotals(booking) {
  const nights = bookingNights(booking.checkIn, booking.checkOut);
  const roomTotal = nights * Number(booking.rate || 0);
  const advance = Math.min(roomTotal, Number(booking.advance || 0));
  const due = Math.max(0, roomTotal - advance);
  return { nights, roomTotal, advance, due };
}

function updateBookingTotalPreview() {
  const previewBooking = {
    checkIn: $("#bookingCheckIn").value,
    checkOut: $("#bookingCheckOut").value,
    rate: Number($("#bookingRate").value || 0),
    advance: Number($("#bookingAdvance").value || 0)
  };
  const totals = bookingTotals(previewBooking);
  $("#bookingTotalPreview").textContent = money(totals.roomTotal);
  $("#bookingNightPreview").textContent = `${totals.nights} night${totals.nights === 1 ? "" : "s"} - ${money(totals.due)} due`;
}

function renderBookings() {
  const query = $("#bookingSearch")?.value.trim().toLowerCase() || "";
  const status = $("#bookingStatusFilter")?.value || "All";
  const rows = state.bookings
    .filter((booking) => {
      const searchable = [
        booking.id,
        booking.guestName,
        booking.phone,
        booking.roomNumber,
        booking.vehicle,
        booking.idNumber
      ].join(" ").toLowerCase();
      return searchable.includes(query) && (status === "All" || booking.status === status);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((booking) => {
      const totals = bookingTotals(booking);
      return `
        <tr>
          <td><strong>${booking.id}</strong><br><small>${formatDateTime(booking.createdAt)}</small></td>
          <td>${escapeHtml(booking.guestName)}<br><small>${escapeHtml(booking.phone)}</small></td>
          <td>${escapeHtml(booking.roomNumber)}<br><small>${escapeHtml(booking.roomType)}</small></td>
          <td>${formatDateOnly(booking.checkIn)} - ${formatDateOnly(booking.checkOut)}<br><small>${totals.nights} night${totals.nights === 1 ? "" : "s"}</small></td>
          <td><span class="status-pill ${booking.status === "Cancelled" ? "muted" : ""}">${escapeHtml(booking.status)}</span><br><small>${escapeHtml(booking.paymentStatus)}</small></td>
          <td><strong>${money(totals.due)}</strong><br><small>Total ${money(totals.roomTotal)}</small></td>
          <td>${booking.idProofImage ? `<img class="proof-thumb" src="${booking.idProofImage}" alt="ID proof for ${escapeAttr(booking.guestName)}">` : "<small>No image</small>"}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-view-booking="${booking.id}" title="View booking"><svg><use href="#i-receipt"></use></svg></button>
              <button class="icon-btn" data-edit-booking="${booking.id}" title="Edit booking"><svg><use href="#i-edit"></use></svg></button>
              <button class="icon-btn" data-delete-booking="${booking.id}" title="Delete booking"><svg><use href="#i-trash"></use></svg></button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  $("#bookingsTable").innerHTML = rows || `<tr><td colspan="8" class="empty-row">No room bookings found</td></tr>`;
  $("#bookingCountLabel").textContent = `${state.bookings.length} booking${state.bookings.length === 1 ? "" : "s"}`;
  updateBookingTotalPreview();
}

async function saveBooking(event) {
  event.preventDefault();
  const id = $("#bookingId").value || nextBookingId();
  const existing = state.bookings.find((booking) => booking.id === id);
  const file = $("#bookingIdProofImage").files?.[0];
  const idProofImage = file ? await fileToDataUrl(file) : $("#bookingExistingProof").value;

  const payload = {
    id,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    guestName: $("#bookingGuestName").value.trim(),
    phone: $("#bookingPhone").value.trim(),
    email: $("#bookingEmail").value.trim(),
    idType: $("#bookingIdType").value,
    idNumber: $("#bookingIdNumber").value.trim(),
    idProofImage,
    roomNumber: $("#bookingRoomNumber").value.trim(),
    roomType: $("#bookingRoomType").value,
    checkIn: $("#bookingCheckIn").value,
    checkOut: $("#bookingCheckOut").value,
    adults: Number($("#bookingAdults").value || 1),
    children: Number($("#bookingChildren").value || 0),
    rate: Number($("#bookingRate").value || 0),
    advance: Number($("#bookingAdvance").value || 0),
    status: $("#bookingStatus").value,
    paymentStatus: $("#bookingPaymentStatus").value,
    vehicle: $("#bookingVehicle").value.trim(),
    source: $("#bookingSource").value,
    address: $("#bookingAddress").value.trim(),
    notes: $("#bookingNotes").value.trim()
  };

  const index = state.bookings.findIndex((booking) => booking.id === id);
  if (index >= 0) {
    state.bookings[index] = payload;
  } else {
    state.bookings.unshift(payload);
  }

  save(storageKeys.bookings, state.bookings);
  resetBookingForm();
  renderAll();
  toast("Room booking saved");
}

function nextBookingId() {
  const numbers = state.bookings
    .map((booking) => Number(String(booking.id).replace(/\D/g, "")))
    .filter(Boolean);
  const next = Math.max(5000, ...numbers) + 1;
  return `ROOM-${next}`;
}

function editBooking(id) {
  const booking = state.bookings.find((entry) => entry.id === id);
  if (!booking) return;
  $("#bookingFormTitle").textContent = "Edit Room Booking";
  $("#bookingId").value = booking.id;
  $("#bookingExistingProof").value = booking.idProofImage || "";
  $("#bookingGuestName").value = booking.guestName || "";
  $("#bookingPhone").value = booking.phone || "";
  $("#bookingEmail").value = booking.email || "";
  $("#bookingIdType").value = booking.idType || "Aadhaar";
  $("#bookingIdNumber").value = booking.idNumber || "";
  $("#bookingRoomNumber").value = booking.roomNumber || "";
  $("#bookingRoomType").value = booking.roomType || "Single";
  $("#bookingCheckIn").value = booking.checkIn || "";
  $("#bookingCheckOut").value = booking.checkOut || "";
  $("#bookingAdults").value = booking.adults || 1;
  $("#bookingChildren").value = booking.children || 0;
  $("#bookingRate").value = booking.rate || 0;
  $("#bookingAdvance").value = booking.advance || 0;
  $("#bookingStatus").value = booking.status || "Reserved";
  $("#bookingPaymentStatus").value = booking.paymentStatus || "Unpaid";
  $("#bookingVehicle").value = booking.vehicle || "";
  $("#bookingSource").value = booking.source || "Walk-in";
  $("#bookingAddress").value = booking.address || "";
  $("#bookingNotes").value = booking.notes || "";
  $("#bookingIdProofImage").value = "";
  renderProofPreview(booking.idProofImage);
  updateBookingTotalPreview();
  $("#bookingGuestName").focus();
}

function resetBookingForm() {
  $("#bookingForm").reset();
  $("#bookingId").value = "";
  $("#bookingExistingProof").value = "";
  $("#bookingAdults").value = 1;
  $("#bookingChildren").value = 0;
  $("#bookingRate").value = 0;
  $("#bookingAdvance").value = 0;
  $("#bookingFormTitle").textContent = "New Room Booking";
  renderProofPreview("");
  updateBookingTotalPreview();
}

function deleteBooking(id) {
  const ok = window.confirm("Delete this room booking?");
  if (!ok) return;
  state.bookings = state.bookings.filter((booking) => booking.id !== id);
  save(storageKeys.bookings, state.bookings);
  renderAll();
  toast("Room booking deleted");
}

function showBooking(booking) {
  const totals = bookingTotals(booking);
  $("#bookingDetailContent").innerHTML = `
    <div>
      <p class="eyebrow">${escapeHtml(booking.id)}</p>
      <h2>${escapeHtml(booking.guestName)}</h2>
      <p>${formatDateOnly(booking.checkIn)} - ${formatDateOnly(booking.checkOut)} - Room ${escapeHtml(booking.roomNumber)}</p>
    </div>
    <div class="booking-detail-grid">
      <div><span>Phone</span><strong>${escapeHtml(booking.phone)}</strong></div>
      <div><span>Email</span><strong>${escapeHtml(booking.email || "Not provided")}</strong></div>
      <div><span>ID Proof</span><strong>${escapeHtml(booking.idType)} - ${escapeHtml(booking.idNumber)}</strong></div>
      <div><span>Vehicle</span><strong>${escapeHtml(booking.vehicle || "Not provided")}</strong></div>
      <div><span>Guests</span><strong>${booking.adults} adult${booking.adults === 1 ? "" : "s"}, ${booking.children} child${booking.children === 1 ? "" : "ren"}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(booking.status)} - ${escapeHtml(booking.paymentStatus)}</strong></div>
      <div><span>Stay Total</span><strong>${money(totals.roomTotal)} (${totals.nights} night${totals.nights === 1 ? "" : "s"})</strong></div>
      <div><span>Due</span><strong>${money(totals.due)}</strong></div>
      <div><span>Address</span><strong>${escapeHtml(booking.address || "Not provided")}</strong></div>
      <div><span>Notes</span><strong>${escapeHtml(booking.notes || "None")}</strong></div>
    </div>
    ${booking.idProofImage ? `<div><span class="eyebrow">ID Proof Image</span><div class="proof-preview"><img src="${booking.idProofImage}" alt="ID proof image"></div></div>` : ""}
  `;
  $("#bookingDialog").showModal();
}

function renderProofPreview(dataUrl) {
  $("#bookingProofPreview").innerHTML = dataUrl
    ? `<img src="${dataUrl}" alt="Selected ID proof image">`
    : "No ID proof image selected";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read ID proof image"));
    reader.readAsDataURL(file);
  });
}

function renderSettings() {
  $("#settingBusinessName").value = state.settings.businessName;
  $("#settingFooter").value = state.settings.footer;
  $("#settingCurrency").value = state.settings.currency;
  $("#settingTax").value = state.settings.taxRate;
  $("#settingAddress").value = state.settings.address;
  $("#settingLoginUsername").value = state.settings.loginUsername || "admin";
  $("#settingLoginPassword").value = "";
  $("#settingLoginConfirm").value = "";
  $("#taxRate").value = $("#taxRate").value || state.settings.taxRate;
}

function saveSettings(event) {
  event.preventDefault();
  const loginPassword = $("#settingLoginPassword").value;
  const loginConfirm = $("#settingLoginConfirm").value;
  if (loginPassword || loginConfirm) {
    if (loginPassword !== loginConfirm) {
      toast("Login passwords do not match");
      return;
    }
    if (loginPassword.length < 4) {
      toast("Use at least 4 characters for the login password");
      return;
    }
    state.settings.loginPasswordHash = hashText(loginPassword);
  }

  state.settings = {
    ...state.settings,
    businessName: $("#settingBusinessName").value.trim() || "Hozer POS",
    footer: $("#settingFooter").value.trim() || "Thank you for shopping with us",
    currency: $("#settingCurrency").value.trim() || "$",
    taxRate: Number($("#settingTax").value || 0),
    address: $("#settingAddress").value.trim(),
    loginUsername: $("#settingLoginUsername").value.trim() || "admin"
  };
  $("#taxRate").value = state.settings.taxRate;
  $("#settingLoginPassword").value = "";
  $("#settingLoginConfirm").value = "";
  save(storageKeys.settings, state.settings);
  renderAll();
  toast("Settings saved");
}

function isLoggedIn() {
  return sessionStorage.getItem(storageKeys.session) === "true";
}

function renderAuthState() {
  document.body.classList.toggle("login-active", !isLoggedIn());
  if (!isLoggedIn()) {
    $("#loginPassword").value = "";
    $("#loginError").textContent = "";
    $("#loginUsername").value = state.settings.loginUsername || "admin";
  }
}

function handleLogin(event) {
  event.preventDefault();
  const username = $("#loginUsername").value.trim();
  const passwordHash = hashText($("#loginPassword").value);
  const validUser = username === state.settings.loginUsername;
  const validPassword = passwordHash === state.settings.loginPasswordHash;
  if (!validUser || !validPassword) {
    $("#loginError").textContent = "Invalid user ID or password";
    return;
  }
  sessionStorage.setItem(storageKeys.session, "true");
  $("#loginForm").reset();
  renderAuthState();
  toast("Logged in");
}

function logout() {
  sessionStorage.removeItem(storageKeys.session);
  renderAuthState();
}

function buildSalesSummary(orders = state.orders) {
  const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const tax = orders.reduce((sum, order) => sum + Number(order.tax || 0), 0);
  const discount = orders.reduce((sum, order) => sum + Number(order.discount || 0), 0);
  const itemCount = orders.reduce((sum, order) => {
    return sum + (order.items || []).reduce((lineSum, item) => lineSum + Number(item.qty || 0), 0);
  }, 0);

  return {
    orderCount: orders.length,
    itemCount,
    revenue,
    tax,
    discount,
    firstSaleAt: orders.at(-1)?.createdAt || null,
    lastSaleAt: orders[0]?.createdAt || null
  };
}

function buildBackupPayload() {
  return {
    app: "storefront-pos",
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    settings: structuredClone(state.settings),
    items: structuredClone(state.items),
    orders: structuredClone(state.orders),
    drafts: structuredClone(state.drafts),
    bookings: structuredClone(state.bookings),
    summary: buildSalesSummary()
  };
}

function exportBackup() {
  downloadJson(`storefront-pos-backup-${fileTimestamp()}.json`, buildBackupPayload());
  toast("Full backup JSON exported");
}

function exportSalesJson() {
  const payload = {
    app: "storefront-pos",
    type: "sales-export",
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    businessName: state.settings.businessName,
    orders: structuredClone(state.orders),
    summary: buildSalesSummary()
  };
  downloadJson(`storefront-pos-sales-${fileTimestamp()}.json`, payload);
  toast("Sales JSON exported");
}

function clearAllSales() {
  if (!state.orders.length) {
    toast("No sales to clear");
    return;
  }

  const ok = window.confirm("Clear all bill history and sales reports? Menu items, stock, drafts, and settings will stay saved.");
  if (!ok) return;

  state.orders = [];
  state.items = state.items.map((item) => ({ ...item, sold: 0 }));
  save(storageKeys.orders, state.orders);
  save(storageKeys.items, state.items);
  renderAll();
  toast("All sales cleared");
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importBackupFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ""));
      validateBackupPayload(payload);

      const ok = window.confirm("Importing this backup will replace current items, bills, drafts, room bookings, and settings. Continue?");
      if (!ok) return;

      state.settings = { ...state.settings, ...payload.settings };
      state.items = payload.items;
      state.orders = payload.orders;
      state.drafts = payload.drafts || [];
      state.bookings = payload.bookings || [];
      state.cart = [];
      state.selectedCategory = "All";
      state.selectedPayment = "Cash";
      ensureLoginDefaults();
      persistAll();
      clearCart();
      renderAll();
      toast("Backup imported successfully");
    } catch (error) {
      toast(error.message || "Could not import this backup file");
    }
  };
  reader.readAsText(file);
}

function validateBackupPayload(payload) {
  if (!payload || payload.app !== "storefront-pos") {
    throw new Error("This is not a Hozer POS backup file");
  }
  if (!Array.isArray(payload.items) || !Array.isArray(payload.orders)) {
    throw new Error("Backup file is missing items or sales history");
  }
  if (!payload.settings || typeof payload.settings !== "object") {
    throw new Error("Backup file is missing settings");
  }
  payload.items.forEach((item) => {
    if (!item.id || !item.name || !item.sku) {
      throw new Error("Backup has an invalid item record");
    }
  });
  payload.orders.forEach((order) => {
    if (!order.id || !order.createdAt || !Array.isArray(order.items)) {
      throw new Error("Backup has an invalid bill record");
    }
  });
  (payload.bookings || []).forEach((booking) => {
    if (!booking.id || !booking.guestName || !booking.roomNumber) {
      throw new Error("Backup has an invalid room booking record");
    }
  });
}

function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function showReceipt(order) {
  const itemRows = order.items.map((item) => `
    <div class="receipt-line">
      <div><strong>${escapeHtml(item.name)}</strong><small>${item.qty} x ${money(item.price)}</small></div>
      <strong>${money(item.qty * item.price)}</strong>
    </div>
  `).join("");

  $("#receiptContent").innerHTML = `
    <h2>${escapeHtml(state.settings.businessName)}</h2>
    <p>${escapeHtml(state.settings.address || "")}</p>
    <div class="receipt-meta">
      <span>Bill: <strong>${order.id}</strong></span>
      <span>Date: ${formatDateTime(order.createdAt)}</span>
      <span>Customer: ${escapeHtml(order.customerName)}${order.customerPhone ? ` - ${escapeHtml(order.customerPhone)}` : ""}</span>
      <span>Payment: ${escapeHtml(order.payment)}</span>
    </div>
    ${itemRows}
    <div class="receipt-total">
      <div><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
      <div><span>Discount</span><strong>-${money(order.discount)}</strong></div>
      <div><span>Tax</span><strong>${money(order.tax)}</strong></div>
      <div class="grand"><span>Total</span><strong>${money(order.total)}</strong></div>
    </div>
    <p style="margin-top:18px">${escapeHtml(order.footer || state.settings.footer)}</p>
  `;

  $("#receiptDialog").showModal();
}

function setPaymentButtons() {
  $$("[data-payment]").forEach((button) => {
    button.classList.toggle("active", button.dataset.payment === state.selectedPayment);
  });
}

function switchView(viewId) {
  state.activeView = viewId;
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  renderShell();
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#logoutBtn").addEventListener("click", logout);
  $$(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $$("[data-go-pos]").forEach((button) => {
    button.addEventListener("click", () => switchView("posView"));
  });
  $("#salesRange").addEventListener("change", drawSalesChart);
  $("#productSearch").addEventListener("input", renderProducts);
  $("#sortProducts").addEventListener("change", renderProducts);
  $("#categoryTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    renderCategories();
    renderProducts();
  });
  $("#productGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-item]");
    if (button) addToCart(button.dataset.addItem);
  });
  $("#cartItems").addEventListener("click", (event) => {
    const inc = event.target.closest("[data-cart-inc]");
    const dec = event.target.closest("[data-cart-dec]");
    if (inc) updateCartQty(inc.dataset.cartInc, 1);
    if (dec) updateCartQty(dec.dataset.cartDec, -1);
  });
  $("#clearCartBtn").addEventListener("click", clearCart);
  $("#holdDraftBtn").addEventListener("click", holdDraft);
  $("#checkoutBtn").addEventListener("click", checkout);
  $("#discountValue").addEventListener("input", renderCart);
  $("#discountType").addEventListener("change", renderCart);
  $("#taxRate").addEventListener("input", renderCart);
  $$("[data-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPayment = button.dataset.payment;
      setPaymentButtons();
    });
  });
  $("#itemForm").addEventListener("submit", saveItem);
  $("#resetItemForm").addEventListener("click", resetItemForm);
  $("#itemSearch").addEventListener("input", renderItemsTable);
  $("#itemsTable").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-item]");
    const del = event.target.closest("[data-delete-item]");
    if (edit) editItem(edit.dataset.editItem);
    if (del) deleteItem(del.dataset.deleteItem);
  });
  $("#orderSearch").addEventListener("input", renderOrders);
  $("#orderPaymentFilter").addEventListener("change", renderOrders);
  $("#exportSalesBtn").addEventListener("click", exportSalesJson);
  $("#clearSalesBtn").addEventListener("click", clearAllSales);
  $("#ordersTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-receipt]");
    if (!button) return;
    const order = state.orders.find((entry) => entry.id === button.dataset.viewReceipt);
    if (order) showReceipt(order);
  });
  $("#draftGrid").addEventListener("click", (event) => {
    const resume = event.target.closest("[data-resume-draft]");
    const del = event.target.closest("[data-delete-draft]");
    if (resume) resumeDraft(resume.dataset.resumeDraft);
    if (del) deleteDraft(del.dataset.deleteDraft);
  });
  $("#bookingForm").addEventListener("submit", saveBooking);
  $("#resetBookingForm").addEventListener("click", resetBookingForm);
  $("#bookingSearch").addEventListener("input", renderBookings);
  $("#bookingStatusFilter").addEventListener("change", renderBookings);
  ["#bookingCheckIn", "#bookingCheckOut", "#bookingRate", "#bookingAdvance"].forEach((selector) => {
    $(selector).addEventListener("input", updateBookingTotalPreview);
  });
  $("#bookingIdProofImage").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      renderProofPreview($("#bookingExistingProof").value);
      return;
    }
    renderProofPreview(await fileToDataUrl(file));
  });
  $("#bookingsTable").addEventListener("click", (event) => {
    const view = event.target.closest("[data-view-booking]");
    const edit = event.target.closest("[data-edit-booking]");
    const del = event.target.closest("[data-delete-booking]");
    if (view) {
      const booking = state.bookings.find((entry) => entry.id === view.dataset.viewBooking);
      if (booking) showBooking(booking);
    }
    if (edit) editBooking(edit.dataset.editBooking);
    if (del) deleteBooking(del.dataset.deleteBooking);
  });
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#exportBackupBtn").addEventListener("click", exportBackup);
  $("#importBackupBtn").addEventListener("click", () => $("#backupImportInput").click());
  $("#backupImportInput").addEventListener("change", importBackupFile);
  $("#closeReceiptBtn").addEventListener("click", () => $("#receiptDialog").close());
  $("#closeBookingBtn").addEventListener("click", () => $("#bookingDialog").close());
  $("#printReceiptBtn").addEventListener("click", () => window.print());
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  $("#toastRegion").append(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
  }, 2400);
  setTimeout(() => node.remove(), 3000);
}

function emptyBlock(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function initials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

loadState();
bindEvents();
$("#taxRate").value = state.settings.taxRate;
renderAll();
renderAuthState();
