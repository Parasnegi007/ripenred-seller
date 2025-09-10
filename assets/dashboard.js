// ✅ dashboard.js - Production Ready Version

// Global Configuration
let authToken = null;
let sellerInfo = null;

// Initialize Axios instance with interceptors
const axiosInstance = axios.create({
  get baseURL() { return getAPIURL(); },
  timeout: 30000,
  withCredentials: true
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    // Add security headers
    config.headers['X-XSS-Protection'] = '1; mode=block';
    // Removed CSP header as it's handled by HTML meta tag
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await fetch(`${getAPIURL()}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });
          const data = await response.json();
          if (data.token) {
            authToken = data.token;
            localStorage.setItem('sellerAuthToken', data.token);
            // Retry the original request
            return axiosInstance(error.config);
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }
      // If refresh failed, logout
      logout();
    }
    return Promise.reject(error);
  }
);

// Utility Functions
// Toast notification system
function showMessage(message, type = 'info') {
  if (window.notifications) {
    window.notifications.show(message, type);
  } else if (window.toastr) {
    const toastConfig = {
      closeButton: true,
      timeOut: 5000,
      progressBar: true,
      preventDuplicates: true,
      positionClass: 'toast-top-right'
    };
    
    switch(type) {
      case 'error':
        toastr.error(message, 'Error', toastConfig);
        break;
      case 'success':
        toastr.success(message, 'Success', toastConfig);
        break;
      case 'warning':
        toastr.warning(message, 'Warning', toastConfig);
        break;
      default:
        toastr.info(message, 'Info', toastConfig);
    }
  } else {
    // Fallback to alert if notification system not loaded
    alert(message);
  }
}

// Enhanced error handling with retry mechanism
function handleApiError(error, defaultMessage, retryCount = 0) {
  console.error('API Error:', error);
  
  // Network errors might be temporary - retry up to 3 times
  if (error.message === 'Network Error' && retryCount < 3) {
    setTimeout(() => {
      console.log(`Retrying request... Attempt ${retryCount + 1}`);
      return retryRequest(error.config, retryCount + 1);
    }, 1000 * (retryCount + 1)); // Exponential backoff
    return;
  }

  // Handle specific error types
  if (error.response) {
    switch (error.response.status) {
      case 400:
        showMessage('Invalid request. Please check your input.', 'error');
        break;
      case 401:
        showMessage('Session expired. Please login again.', 'error');
        logout();
        break;
      case 403:
        showMessage('You don\'t have permission to perform this action.', 'error');
        break;
      case 404:
        showMessage('Resource not found.', 'error');
        break;
      case 429:
        showMessage('Too many requests. Please try again later.', 'warning');
        break;
      case 500:
        showMessage('Server error. Please try again later.', 'error');
        break;
      default:
        showMessage(error.response.data?.message || defaultMessage, 'error');
    }
  } else if (error.message) {
    showMessage(error.message, 'error');
  } else {
    showMessage(defaultMessage, 'error');
  }

  // Log error to monitoring service (if available)
  logError(error);
}


// Request caching system
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Performance monitoring
const performance = {
  metrics: new Map(),
  startOperation: (name) => {
    performance.metrics.set(name, performance.now());
  },
  endOperation: (name) => {
    const start = performance.metrics.get(name);
    if (start) {
      const duration = performance.now() - start;
      console.debug(`Operation ${name} took ${duration}ms`);
      // Here you could send metrics to your monitoring service
      performance.metrics.delete(name);
    }
  }
};

// Enhanced Authentication Helper with security headers
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Requested-With': 'XMLHttpRequest',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
}

function getMultipartAuthHeaders() {
  return {
    'Authorization': `Bearer ${authToken}`
  };
}

// Initialize Order Notifications
async function initializeOrderNotifications() {
  try {
    // Get seller ID from stored seller info or generate one
    const storedSellerInfo = JSON.parse(localStorage.getItem('sellerInfo') || '{}');
    const sellerId = storedSellerInfo.id || storedSellerInfo._id || 'seller-' + Date.now();
    
    console.log('🔔 Initializing notifications for seller:', sellerId);
    
    // Check if notification manager is available
    if (typeof window.notificationManager !== 'undefined') {
      await window.notificationManager.initialize(sellerId);
      console.log('✅ Order notifications initialized for seller:', sellerId);
    } else if (typeof window.NotificationManager !== 'undefined') {
      // Fallback - create new instance
      const notifManager = new window.NotificationManager();
      await notifManager.initialize(sellerId);
      console.log('✅ Order notifications initialized (fallback) for seller:', sellerId);
    } else {
      console.error('❌ Notification manager not found. Make sure notifications.js is loaded.');
      // Try to load it dynamically
      await loadNotificationScript();
    }
  } catch (error) {
    console.error('❌ Failed to initialize order notifications:', error);
    // Don't show error to user - notifications are non-critical
  }
}

// Dynamically load notification script if not already loaded
async function loadNotificationScript() {
  try {
    const script = document.createElement('script');
    script.src = '/seller-dashboard/assets/utils/notifications.js';
    script.onload = async () => {
      console.log('📦 Notification script loaded dynamically');
      if (window.notificationManager) {
        const storedSellerInfo = JSON.parse(localStorage.getItem('sellerInfo') || '{}');
        const sellerId = storedSellerInfo.id || storedSellerInfo._id || 'seller-' + Date.now();
        await window.notificationManager.initialize(sellerId);
        console.log('✅ Order notifications initialized after dynamic load');
      }
    };
    document.head.appendChild(script);
  } catch (error) {
    console.error('❌ Failed to load notification script:', error);
  }
}

// Check authentication status
function checkAuthentication() {
  authToken = localStorage.getItem('sellerAuthToken');
  const storedSellerInfo = localStorage.getItem('sellerInfo');
  
  if (!authToken) {
    console.log('No auth token found, redirecting to login');
    window.location.href = 'seller.html';
    return false;
  }
  
  if (storedSellerInfo) {
    try {
      sellerInfo = JSON.parse(storedSellerInfo);
      console.log('Seller info loaded:', sellerInfo);
    } catch (e) {
      console.error('Error parsing seller info:', e);
    }
  }
  
  return true;
}

// Logout functionality
function logout() {
  localStorage.removeItem('sellerAuthToken');
  localStorage.removeItem('sellerInfo');
  authToken = null;
  sellerInfo = null;
  showMessage('Logged out successfully', 'success');
  setTimeout(() => {
    window.location.href = 'seller.html';
  }, 1000);
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  console.log('Dashboard initializing...');
  
  if (!checkAuthentication()) {
    return;
  }
  
  // Initialize components
  initializeDashboard();
  
  // Setup logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});

// Initialize dashboard components
function initializeDashboard() {
  loadCategories();
  fetchDashboardStats();
  loadCategoriesForProductForm();
  
  // Initialize order notifications automatically
  initializeOrderNotifications();
  
  // Display seller info if available
  if (sellerInfo) {
    displaySellerInfo();
  }
}

// Display seller information
function displaySellerInfo() {
  const sellerNameElement = document.getElementById('sellerName');
  const vendorNameElement = document.getElementById('vendorName');
  
  if (sellerNameElement && sellerInfo.name) {
    sellerNameElement.textContent = `Welcome, ${sellerInfo.name}`;
  }
  
  if (vendorNameElement && sellerInfo.vendorName) {
    vendorNameElement.textContent = sellerInfo.vendorName;
  }
}

// ✅ Add New Category - Production Ready
async function addNewCategory() {
    if (!authToken) {
        showMessage('Please login to add categories', 'error');
        return;
    }

    const name = document.getElementById("newCategoryName").value.trim();
    const description = document.getElementById("newCategoryDescription").value.trim();
    const slug = document.getElementById("newCategorySlug").value.trim();
    const featured = document.getElementById("newCategoryFeatured").checked;
    const imageFile = document.getElementById("newCategoryImage").files[0];

    // Validation
    if (!name || !description || !slug || !imageFile) {
        showMessage("Name, Description, Slug, and Image are required.", 'error');
        return;
    }

    if (name.length < 2) {
        showMessage("Category name must be at least 2 characters long", 'error');
        return;
    }

    if (description.length < 5) {
        showMessage("Description must be at least 5 characters long", 'error');
        return;
    }

    if (slug.length < 2) {
        showMessage("Slug must be at least 2 characters long", 'error');
        return;
    }

    // Validate image file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
        showMessage("Please upload a valid image file (JPEG, PNG, or WebP)", 'error');
        return;
    }

    if (imageFile.size > 5 * 1024 * 1024) { // 5MB limit
        showMessage("Image file must be smaller than 5MB", 'error');
        return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("slug", slug);
    formData.append("featured", featured);
    formData.append("image", imageFile);

    try {
        const response = await fetch(`${getAPIURL()}/categories`, {
            method: "POST",
            headers: getMultipartAuthHeaders(),
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            showMessage("Category added successfully!", 'success');
            closePopup("addCategoryPopup");
            
            // Clear form
            document.getElementById("newCategoryName").value = '';
            document.getElementById("newCategoryDescription").value = '';
            document.getElementById("newCategorySlug").value = '';
            document.getElementById("newCategoryFeatured").checked = false;
            document.getElementById("newCategoryImage").value = '';
            
            loadCategories();
        } else {
            if (response.status === 401) {
                showMessage('Session expired. Please login again.', 'error');
                logout();
            } else {
                showMessage(data.message || "Error adding category.", 'error');
            }
        }
    } catch (error) {
        handleApiError(error, "Network error occurred while adding category.");
    }
}

// ✏️ Edit/Update Category
async function updateCategory(id) {
    const name = document.getElementById(`editCategoryName_${id}`).value.trim();
    const description = document.getElementById(`editCategoryDescription_${id}`).value.trim();
    const slug = document.getElementById(`editCategorySlug_${id}`).value.trim();
    const featured = document.getElementById(`editCategoryFeatured_${id}`).checked;
    const imageFile = document.getElementById(`editCategoryImage_${id}`).files[0];

    // Validation
    if (!name || !slug) {
        showMessage("Name and Slug are required.", 'error');
        return;
    }

    if (name.length < 2) {
        showMessage("Category name must be at least 2 characters long", 'error');
        return;
    }

    if (slug.length < 2) {
        showMessage("Slug must be at least 2 characters long", 'error');
        return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("slug", slug);
    formData.append("featured", featured);
    if (imageFile) {
        formData.append("image", imageFile);
    }

    try {
        const response = await fetch(`${getAPIURL()}/categories/${id}`, {
            method: "PUT",
            headers: getMultipartAuthHeaders(),
            body: formData,
        });

        if (response.ok) {
            showMessage("Category updated successfully!", 'success');
            loadCategories();
        } else {
            const data = await response.json();
            if (response.status === 401) {
                showMessage('Session expired. Please login again.', 'error');
                logout();
            } else {
                showMessage(data.message || "Error updating category.", 'error');
            }
        }
    } catch (error) {
        handleApiError(error, "Network error occurred while updating category.");
    }
}

// ❌ Delete Category
async function deleteCategory(id) {
    if (!confirm("Are you sure you want to delete this category?")) {
        return;
    }

    try {
        const response = await fetch(`${getAPIURL()}/categories/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        if (response.ok) {
            showMessage("Category deleted successfully!", 'success');
            loadCategories();
        } else {
            const data = await response.json();
            if (response.status === 401) {
                showMessage('Session expired. Please login again.', 'error');
                logout();
            } else {
                showMessage(data.message || "Error deleting category.", 'error');
            }
        }
    } catch (error) {
        handleApiError(error, "Network error occurred while deleting category.");
    }
}

// 📚 Load Categories in Edit Popup
async function loadCategories() {
    try {
        const response = await fetch(`${getAPIURL()}/categories`);
        if (!response.ok) {
            throw new Error("Failed to fetch categories");
        }
        const categories = await response.json();

        const categoryList = document.getElementById("categoryList");
        const editCategoryList = document.getElementById("editCategoryList");

        // Clear both the category list and edit category list before adding new content
        categoryList.innerHTML = '';
        editCategoryList.innerHTML = '';

        // Add "Edit/Add Category" link at the top of the category list
        categoryList.innerHTML = `
            <li onclick="openPopup('editCategoriesPopup')">📝 Edit/Add Category</li>
        `;

        categories.forEach(category => {
            // Add each category to the main category list
            categoryList.innerHTML += `
                <li onclick="openCategoryPopup('${category._id}')">
                    📚 ${category.name}
                </li>
            `;

            // Now, populate the edit category section (editCategoryList)
            editCategoryList.innerHTML += `
                <div class="category-item" id="category_${category._id}">
                    <label>Name:</label>
                    <input type="text" id="editCategoryName_${category._id}" value="${category.name}" />

                    <label>Description:</label>
                    <textarea id="editCategoryDescription_${category._id}">${category.description || ''}</textarea>

                    <label>Upload Image:</label>
                    <input type="file" id="editCategoryImage_${category._id}" />

                    <!-- Display the current image if it exists -->
                    ${category.image ? `<img src="${category.image}" alt="Current Image" class="category-image-preview" />` : ''}

                    <label>Slug:</label>
                    <input type="text" id="editCategorySlug_${category._id}" value="${category.slug}" />

                    <label>
                        <input type="checkbox" id="editCategoryFeatured_${category._id}" ${category.featured ? 'checked' : ''} />
                        Featured
                    </label>

                    <button onclick="updateCategory('${category._id}')">✏️ Update</button>
                    <button onclick="deleteCategory('${category._id}')">❌ Delete</button>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading categories:", error);
    }
}

// 📂 Open Popup and Load Data
function openPopup(id) {
    document.getElementById(id).style.display = 'block';
    if (id === 'editCategoriesPopup') {
        loadCategories();  // Change to loadCategories instead of loadEditCategories
    }
}

// Function to open the "Add Product" form
function openAddProductForm() {
    const popup = document.getElementById('addProductPopup');
    popup.style.display = 'block';
}
const quillAdd = new Quill("#newProductDescription", {
  theme: "snow",
  modules: {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        [{ 'font': [] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        [{ 'align': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['blockquote', 'code-block'],
        [{ 'color': [] }, { 'background': [] }],
        ['link', 'image', 'video']
      ],
      handlers: {
        // 🔧 Custom image handler
        image: function () {
          const fileInput = document.createElement("input");
          fileInput.setAttribute("type", "file");
          fileInput.setAttribute("accept", "image/*");
          fileInput.click();

          fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            try {
              const resizedBlob = await resizeImageBeforeUpload(file, 400, 400); // ⏬ Resize before upload
              const formData = new FormData();
              formData.append("image", resizedBlob, file.name);

              // 🔁 Upload to backend
              const res = await fetch(`${getAPIURL()}/dashboard/image-upload`, {
                method: "POST",
                body: formData
              });

              const data = await res.json();
              if (res.ok && data.url) {
                const range = this.quill.getSelection();
                this.quill.insertEmbed(range.index, "image", data.url);
              } else {
                throw new Error("Upload failed");
              }
            } catch (error) {
              console.error("❌ Image upload failed:", error);
              alert("Only image links (not base64) are supported.");
            }
          };
        }
      }
    }
  }
});
const quillEdit = new Quill("#editProductDescription", {
  theme: "snow",
  modules: {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        [{ 'font': [] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        [{ 'align': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['blockquote', 'code-block'],
        [{ 'color': [] }, { 'background': [] }],
        ['link', 'image', 'video']
      ],
      handlers: {
        // Custom image handler for edit form
        image: function () {
          const fileInput = document.createElement("input");
          fileInput.setAttribute("type", "file");
          fileInput.setAttribute("accept", "image/*");
          fileInput.click();

          fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;

            try {
              const resizedBlob = await resizeImageBeforeUpload(file, 400, 400);
              const formData = new FormData();
              formData.append("image", resizedBlob, file.name);

              const res = await fetch(`${getAPIURL()}/dashboard/image-upload`, {
                method: "POST",
                body: formData
              });

              const data = await res.json();
              if (res.ok && data.url) {
                const range = this.quill.getSelection();
                this.quill.insertEmbed(range.index, "image", data.url);
              } else {
                throw new Error("Upload failed");
              }
            } catch (error) {
              console.error("❌ Image upload failed:", error);
              alert("Only image links (not base64) are supported.");
            }
          };
        }
      }
    }
  }
});
function resizeImageBeforeUpload(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Export as WebP at maximum quality
        canvas.toBlob(blob => resolve(blob), "image/webp", 1.0);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}


// Function to open the category popup
function openCategoryPopup(categoryId) {
    const popup = document.getElementById('categoryPopup');
    const productList = document.getElementById('productList');

    fetch(`${getAPIURL()}/products/category/${categoryId}`)
        .then(response => response.json())
        .then(products => {
            productList.innerHTML = '';

            products.forEach(product => {
                const productItem = document.createElement('div');
                productItem.classList.add('product-item');
                productItem.innerHTML = `
                    <h4>${product.name}</h4>
                    ${product.outOfStock ? '<p style="color: red;"><strong>Out of Stock</strong></p>' : ''}
                    <p>Price: ₹${product.price}</p>
                    <img src="${product.image}" alt="${product.name}" style="max-width:100px;" />
                    <p>${product.description}</p>
                    <button onclick="editProduct('${product._id}')">✏️ Edit</button>
                    <button onclick="deleteProduct('${product._id}')">❌ Delete</button>
                `;
                productList.appendChild(productItem);
            });
        })
        .catch(error => console.error('Error fetching products:', error));

    popup.style.display = 'block';
}

function closePopup(popupId = "orderDetailsPopup") {
    const popup = document.getElementById(popupId);
    if (popup) popup.style.display = "none";
    else console.warn("closePopup failed: popup not found", popupId);
}

async function editProduct(productId) {
    try {
        const response = await fetch(`${getAPIURL()}/products/${productId}`);
        if (!response.ok) throw new Error(`Failed to fetch product details: ${response.statusText}`);

        const product = await response.json();

        document.getElementById("editProductId").value = product._id;
        document.getElementById("editProductName").value = product.name;
        document.getElementById("editProductPrice").value = product.price;
        document.getElementById("editProductMrp").value = product.mrp;
        document.getElementById("editProductSale").checked = product.sale;
        quillEdit.root.innerHTML = product.description;
        document.getElementById("editProductFeatured").checked = product.featured;
        document.getElementById("editProductOutOfStock").checked = product.outOfStock;

        await loadCategoriesForProductForm(true, product.categoryId);
        openPopup("editProductPopup");
    } catch (error) {
        console.error("❌ Error fetching product details:", error);
    }
}

async function deleteProduct(productId) {
    try {
        const response = await fetch(`${getAPIURL()}/products/${productId}`, { method: "DELETE" });
        if (response.ok) {
            const data = await response.json();
            console.log("✅ Product deleted:", data.message);
        } else {
            console.error("❌ Error:", response.statusText);
        }
    } catch (error) {
        console.error("❌ Network Error:", error);
    }
}

async function updateProduct() {
    const productId = document.getElementById("editProductId").value;
    const productName = document.getElementById("editProductName").value;
    const productPrice = document.getElementById("editProductPrice").value;
    const productMrp = document.getElementById("editProductMrp").value;
    const productSale = document.getElementById("editProductSale").checked;
    const productDescription = quillEdit.root.innerHTML;
    const productImage = document.getElementById("editProductImage").files[0];
    const productCategory = document.getElementById("editProductCategory").value;
    const productFeatured = document.getElementById("editProductFeatured").checked;
    const productOutOfStock = document.getElementById("editProductOutOfStock").checked;

    if (!productId || !productName || !productPrice || !productMrp || !productCategory) {
        alert("Please fill in all required fields.");
        return;
    }

    const formData = new FormData();
    formData.append("name", productName);
    formData.append("price", productPrice);
    formData.append("mrp", productMrp);
    formData.append("sale", productSale);
    formData.append("description", productDescription);
    formData.append("categoryId", productCategory);
    formData.append("featured", productFeatured);
    formData.append("outOfStock", productOutOfStock);
    if (productImage) formData.append("image", productImage);

    try {
        const response = await fetch(`${getAPIURL()}/products/${productId}`, {
            method: "PUT",
            body: formData,
        });

        if (response.ok) {
            alert("✅ Product updated successfully!");
            closePopup("editProductPopup");
            openCategoryPopup(productCategory);
        } else {
            alert("❌ Error updating product.");
        }
    } catch (error) {
        console.error("❌ Error updating product:", error);
    }
}

function addNewProduct() {
    const productName = document.getElementById("newProductName").value;
    const productPrice = document.getElementById("newProductPrice").value;
    const productMrp = document.getElementById("newProductMrp").value;
    const productSale = document.getElementById("newProductSale").checked;
    const productDescription = quillAdd.root.innerHTML;
    const productImage = document.getElementById("newProductImage").files[0];
    const productCategory = document.getElementById("newProductCategory").value;
    const productFeatured = document.getElementById("newProductFeatured").checked;
    const productOutOfStock = document.getElementById("newProductOutOfStock").checked;

    if (!productName || !productPrice || !productMrp || !productCategory) {
        alert("Please fill in all required fields.");
        return;
    }

    const formData = new FormData();
    formData.append("name", productName);
    formData.append("price", productPrice);
    formData.append("mrp", productMrp);
    formData.append("sale", productSale);
    formData.append("description", productDescription);
    formData.append("image", productImage);
    formData.append("categoryId", productCategory);
    formData.append("featured", productFeatured);
    formData.append("outOfStock", productOutOfStock);

    fetch(`${getAPIURL()}/products`, {
        method: "POST",
        body: formData,
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                alert("✅ Product added successfully!");
                closePopup("addProductPopup");
                loadProducts();
            } else {
                alert("❌ Failed to add product.");
            }
        })
        .catch((error) => {
            console.error("❌ Error adding product:", error);
            alert("An error occurred.");
        });
}

async function loadCategoriesForProductForm(editMode = false, selectedCategoryId = null) {
    try {
        const response = await fetch(`${getAPIURL()}/categories`);
        if (!response.ok) throw new Error("Failed to fetch categories");

        const categories = await response.json();
        const categoryDropdown = editMode
            ? document.getElementById("editProductCategory")
            : document.getElementById("newProductCategory");

        if (!categoryDropdown) return console.error("❌ Category dropdown not found!");

        categoryDropdown.innerHTML = '';

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select Category";
        categoryDropdown.appendChild(defaultOption);

        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category._id;
            option.textContent = category.name;
            if (editMode && category._id === selectedCategoryId) option.selected = true;
            categoryDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("❌ Error loading categories:", error);
    }
}

function loadProducts() {
    fetch(`${getAPIURL()}/products`)
        .then((response) => response.json())
        .then((products) => {
            const productListContainer = document.getElementById("productListContainer");

            if (productListContainer) {
                productListContainer.innerHTML = "";

                products.forEach((product) => {
                    const productItem = document.createElement("div");
                    productItem.classList.add("product-item");

                    productItem.innerHTML = `
                        <h4>${product.name}</h4>
                        ${product.outOfStock ? '<p style="color: red;"><strong>Out of Stock</strong></p>' : ''}
                        <p>
                            ${product.sale ? `<span style="text-decoration: line-through; color: gray;">₹${product.mrp}</span>` : ""}
                            <span style="color: ${product.sale ? "red" : "black"};">₹${product.price}</span>
                        </p>
                        <img src="${product.image}" alt="${product.name}" style="max-width:100px;" />
                        <p>${product.description}</p>
                        <button onclick="editProduct('${product._id}')">✏️ Edit</button>
                        <button onclick="deleteProduct('${product._id}', '${product.categoryId}')">❌ Delete</button>
                    `;
                    productListContainer.appendChild(productItem);
                });
            } else {
                console.error("No 'productListContainer' element found in your HTML.");
            }
        })
        .catch((error) => console.error("❌ Error loading products:", error));
}


async function openCategoryPopup(categoryId) {
    const popup = document.getElementById("categoryPopup");
    const productList = document.getElementById("productList");

    try {
        const response = await fetch(`${getAPIURL()}/products/category/${categoryId}`);

        // Handle 404 response gracefully
        if (response.status === 404) {
            console.warn("⚠️ No products found, showing fallback message.");
            productList.innerHTML = "<p>No products available in this category.</p>";
            popup.style.display = "block";
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const products = await response.json();

        productList.innerHTML = ''; // Clear previous products

        if (!Array.isArray(products) || products.length === 0) {
            console.warn(`⚠️ No products found for category: ${categoryId}`);
            productList.innerHTML = "<p>No products available in this category.</p>";
            popup.style.display = "block"; 
            return;
        }

        products.forEach(product => {
            const productItem = document.createElement("div");
            productItem.classList.add("product-item");
            productItem.innerHTML = `
                <h4>${product.name}</h4>
                <p>Price: ₹${product.price}</p>
                <img src="${product.image}" alt="${product.name}" />
                <p>${product.description}</p>
                <button onclick="editProduct('${product._id}')">✏️ Edit</button>
                <button onclick="deleteProduct('${product._id}', '${categoryId}')">❌ Delete</button>
            `;
            productList.appendChild(productItem);
        });

        popup.style.display = 'block';
    } catch (error) {
        console.error(`❌ Error fetching products for category ${categoryId}:`, error);
    }
}

// ✅ Re-initialize product categories for product form
window.addEventListener("DOMContentLoaded", function () {
    loadCategoriesForProductForm();
});


// Fetch and display dashboard stats
window.addEventListener("DOMContentLoaded", fetchDashboardStats);
async function fetchDashboardStats() {
  const token = localStorage.getItem("sellerAuthToken");  // ✅ Get the token
  if (!token) {
    window.location.href = "seller.html";
    return;
  }
  try {
    const response = await fetch(`${getAPIURL()}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` }        // ✅ Add header here
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    document.getElementById("totalUsers").textContent = data.totalUsers || 0;
    document.getElementById("totalProducts").textContent = data.totalProducts || 0;
    document.getElementById("totalOrders").textContent = data.totalOrders || 0;
    document.getElementById("totalSales").textContent = `₹${data.totalSales || 0}`;
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
  }
}


// Global variables for the chart
let totalOrdersChart;
let currentTimePeriod = "daily"; // Default time period
let userGrowthChart;
let UserDistributionChart;
// Function to render the Total Orders chart
function renderTotalOrdersChart(labels, data) {
    const ctx = document.getElementById("totalOrdersChart").getContext("2d");

    if (totalOrdersChart) {
        totalOrdersChart.destroy();
    }

    totalOrdersChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Total Orders",
                data: data,
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                title: { display: true, text: "Total Orders" }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ✅ Function to Fetch and Update Total Orders Chart
async function updateTotalOrdersChart() {
    const chartContainer = document.getElementById("totalOrdersChart");
    if (!chartContainer) {
        console.error("Total orders chart container not found");
        return;
    }

    // Show loading state
    chartContainer.style.opacity = "0.5";

    const token = localStorage.getItem("sellerAuthToken");
    if (!token) {
        window.location.href = "seller.html";
        return;
    }

    try {
        const response = await fetch(`${getAPIURL()}/dashboard/orders?timePeriod=${currentTimePeriod}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { labels, data } = await response.json();
        renderTotalOrdersChart(labels, data);
    } catch (error) {
        console.error("Error updating Total Orders chart:", error);
    }
}

// Show the chart based on type
function showChart(type) {
    hideAllCharts();
    const chartControls = document.getElementById("chartControls");
    chartControls.style.display = "flex";

    // Update the buttons to show current time period
    const buttons = chartControls.getElementsByTagName("button");
    Array.from(buttons).forEach(btn => {
        const onclickAttr = btn.getAttribute("onclick");
        if (onclickAttr && onclickAttr.includes(`'${currentTimePeriod}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    switch (type) {
        case "Total Orders":
            document.getElementById("totalOrdersChartContainer").style.display = "block";
            document.getElementById("orderControls").style.display = "flex";
            currentChartType = "orders";
            updateTotalOrdersChart();
            break;
        case "Total Products":
            document.getElementById("totalProductsChartContainer").style.display = "block";
            currentChartType = "products";
            updateTotalProductsChart();
            break;
        case "Total Users":
            document.getElementById("userGrowthSection").style.display = "block";
            document.getElementById("toggleChartBtn").style.display = "block";
            currentChartType = "growth";
            updateUserGrowthChart();
            break;
    }
}

// Total Orders card click
document.getElementById("totalOrders").addEventListener("click", () => {
    hideAllCharts();
    document.getElementById("totalOrdersChartContainer").style.display = "block";
    document.getElementById("orderControls").style.display = "flex";
    document.getElementById("toggleChartBtn").style.display = "none";
    document.getElementById("chartControls").style.display = "flex";
    document.getElementById("totalProductsChartContainer").style.display = "none";
    currentChartType = "orders";
    // Update the time period buttons to show current selection
    updateTimePeriodButtons();
    updateTotalOrdersChart();
});

// Function to update time period buttons to show current selection
function updateTimePeriodButtons() {
    const chartControls = document.getElementById("chartControls");
    if (!chartControls) return;

    // Get all buttons within chartControls
    const buttons = chartControls.getElementsByTagName("button");
    Array.from(buttons).forEach(btn => {
        // Extract period from the onclick attribute
        const onclickAttr = btn.getAttribute("onclick");
        if (onclickAttr) {
            const match = onclickAttr.match(/changeTimePeriod\('(\w+)'\)/);
            if (match && match[1] === currentTimePeriod) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

// Hide chart containers initially
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("totalOrdersChartContainer").style.display = "none";
    document.getElementById("chartControls").style.display = "none";
    document.getElementById("orderControls").style.display = "none";
    document.getElementById("totalProductsChartContainer").style.display = "none";
});

// Event listener for the Total Users card
document.getElementById("totalUsers").addEventListener("click", () => {
    hideAllCharts();
    document.getElementById("userGrowthSection").style.display = "block";
    document.getElementById("chartControls").style.display = "flex";
    document.getElementById("toggleChartBtn").style.display = "block";
    document.getElementById("totalProductsChartContainer").style.display = "none";
    currentChartType = "growth";
    // Update the time period buttons to show current selection
    updateTimePeriodButtons();
    updateUserGrowthChart();
});

function hideAllCharts() {
    document.getElementById("userGrowthSection").style.display = "none";
    document.getElementById("userDistributionSection").style.display = "none";
    document.getElementById("totalOrdersChartContainer").style.display = "none";
    document.getElementById("toggleChartBtn").style.display = "none"; 
    document.getElementById("totalProductsChartContainer").style.display = "none";
    document.getElementById("orderControls").style.display = "none";
}
// Fetch and update the User Growth chart
async function updateUserGrowthChart() {
    const chartContainer = document.getElementById("userGrowthChart");
    if (!chartContainer) {
        console.error("User growth chart container not found");
        return;
    }

    // Show loading state
    chartContainer.style.opacity = "0.5";
    
    try {
        const token = localStorage.getItem("sellerAuthToken");
        if (!token) {
            throw new Error("Authentication token not found");
        }

        const response = await fetch(`${getAPIURL()}/dashboard/users-growth?timePeriod=${currentTimePeriod}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        console.log("Received user growth data:", data);

        if (!data || !Array.isArray(data.labels) || !Array.isArray(data.data)) {
            throw new Error("Invalid data received for User Growth chart");
        }

        if (data.labels.length !== data.data.length) {
            throw new Error("Mismatched labels and data arrays");
        }

        // Ensure we have data to display
        if (data.labels.length === 0) {
            chartContainer.innerHTML = "<p>No user growth data available for this period</p>";
            return;
        }

        renderUserGrowthChart(data.labels, data.data);
    } catch (error) {
        console.error("Error updating User Growth chart:", error);
    }
}


// Change time period
function changeTimePeriod(period) {
    if (period === currentTimePeriod) return; // Don't update if period hasn't changed
    
    currentTimePeriod = period;
    
    // Update time period buttons visual state
    const chartControls = document.getElementById("chartControls");
    if (chartControls) {
        const buttons = chartControls.getElementsByTagName("button");
        Array.from(buttons).forEach(btn => {
            const onclickAttr = btn.getAttribute("onclick");
            if (onclickAttr && onclickAttr.includes(`'${period}'`)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Find which chart is currently visible and update it
    if (document.getElementById("userGrowthSection").style.display === "block") {
        currentChartType = "growth";
        updateUserGrowthChart();
    } else if (document.getElementById("totalOrdersChartContainer").style.display === "block") {
        currentChartType = "orders";
        updateTotalOrdersChart();
    } else if (document.getElementById("totalProductsChartContainer").style.display === "block") {
        currentChartType = "products";
        updateTotalProductsChart();
    }

    // Reset opacity for all chart containers
    const userGrowthChart = document.getElementById("userGrowthChart");
    const totalOrdersChart = document.getElementById("totalOrdersChart");
    const totalProductsChart = document.getElementById("totalProductsChart");

    if (userGrowthChart) userGrowthChart.style.opacity = "1";
    if (totalOrdersChart) totalOrdersChart.style.opacity = "1";
    if (totalProductsChart) totalProductsChart.style.opacity = "1";
}

// Populate cities dynamically
async function populateCities() {
    try {
        const response = await fetch(`${getAPIURL()}/dashboard/cities`);
        const cities = await response.json();

        const citySelector = document.getElementById("citySelector");
        citySelector.innerHTML = '<option value="all">All Cities</option>';

        cities.forEach(city => {
            const option = document.createElement("option");
            option.value = city;
            option.textContent = city;
            citySelector.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading cities:", error);
    }
}

// Update User Distribution chart
async function updateUserDistributionChart() {
    try {
        const response = await fetch(`${getAPIURL()}/dashboard/users-by-state`);
        const data = await response.json();

        if (!data.states || !data.counts) {
            throw new Error("Invalid data received for User Distribution chart.");
        }

        renderUserDistributionChart(data.states, data.counts);
    } catch (error) {
        console.error("Error updating User Distribution chart:", error);
    }
}

// Render User Growth Chart
function renderUserGrowthChart(labels, data) {
    const canvas = document.getElementById("userGrowthChart");
    const ctx = canvas.getContext("2d");

    // Cleanup old chart instance properly
    if (userGrowthChart) {
        userGrowthChart.destroy();
        userGrowthChart = null;
    }

    // Reset canvas to clear any artifacts
    canvas.style.opacity = "1";
    const parentWidth = canvas.parentElement.offsetWidth;
    canvas.width = parentWidth;
    canvas.height = Math.min(parentWidth * 0.5, 400); // Maintain good aspect ratio

    userGrowthChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Total Users",
                data: data,
                backgroundColor: "rgba(75, 192, 192, 0.6)",
                borderColor: "rgba(75, 192, 192, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `Total Users (${currentTimePeriod.charAt(0).toUpperCase() + currentTimePeriod.slice(1)})`,
                    font: {
                        size: 16
                    }
                }
            },
            onClick: async (event, elements) => {
                if (elements.length && currentTimePeriod === "yearly") {
                    const index = elements[0].index;
                    const clickedMonthLabel = labels[index];
                    const monthNumber = new Date(`${clickedMonthLabel} 1, 2023`).getMonth();
                    const year = new Date().getFullYear();
                    await updateUserGrowthChartForMonth(year, monthNumber);
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render User Distribution Chart
function renderUserDistributionChart(labels, data) {
    const ctx = document.getElementById("userDistributionChart").getContext("2d");

    if (userDistributionChart) {
        userDistributionChart.destroy();
    }

    userDistributionChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: labels,
            datasets: [{
                label: "Users by State",
                data: data,
                backgroundColor: [
                    "rgba(255, 99, 132, 0.6)",
                    "rgba(54, 162, 235, 0.6)",
                    "rgba(255, 206, 86, 0.6)",
                    "rgba(75, 192, 192, 0.6)",
                    "rgba(153, 102, 255, 0.6)",
                    "rgba(255, 159, 64, 0.6)"
                ],
                borderColor: [
                    "rgba(255, 99, 132, 1)",
                    "rgba(54, 162, 235, 1)",
                    "rgba(255, 206, 86, 1)",
                    "rgba(75, 192, 192, 1)",
                    "rgba(153, 102, 255, 1)",
                    "rgba(255, 159, 64, 1)"
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                title: { display: true, text: "User Distribution by State" }
            }
        }
    });
}

// Toggle Chart View
async function toggleChart() {
    const userGrowthSection = document.getElementById("userGrowthSection");
    const userDistributionSection = document.getElementById("userDistributionSection");
    const toggleChartBtn = document.getElementById("toggleChartBtn");

    if (currentChartType === "growth") {
        currentChartType = "geographical";
        userGrowthSection.style.display = "none";
        userDistributionSection.style.display = "block";
        toggleChartBtn.textContent = "Show Growth Chart";
        updateUserDistributionChart();
    } else {
        currentChartType = "growth";
        userDistributionSection.style.display = "none";
        userGrowthSection.style.display = "block";
        toggleChartBtn.textContent = "Show User Distribution";
    }
}

// Total Products chart setup
let totalProductsChart;
document.getElementById("totalProducts").addEventListener("click", () => {
    hideAllCharts();
    document.getElementById("totalProductsChartContainer").style.display = "block";
    document.getElementById("chartControls").style.display = "flex";
    currentChartType = "products";
    updateTotalProductsChart();
});

// Render Total Products Pie Chart
function renderTotalProductsChart(labels, data) {
    const ctx = document.getElementById("totalProductsChart").getContext("2d");

    if (totalProductsChart) {
        totalProductsChart.destroy();
    }

    totalProductsChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: labels,
            datasets: [{
                label: "Products per Category",
                data: data,
                backgroundColor: [
                    "rgba(255, 99, 132, 0.6)",
                    "rgba(54, 162, 235, 0.6)",
                    "rgba(255, 206, 86, 0.6)",
                    "rgba(75, 192, 192, 0.6)",
                    "rgba(153, 102, 255, 0.6)",
                    "rgba(255, 159, 64, 0.6)"
                ],
                borderColor: [
                    "rgba(255, 99, 132, 1)",
                    "rgba(54, 162, 235, 1)",
                    "rgba(255, 206, 86, 1)",
                    "rgba(75, 192, 192, 1)",
                    "rgba(153, 102, 255, 1)",
                    "rgba(255, 159, 64, 1)"
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                title: { display: true, text: "Products per Category" }
            }
        }
    });
}

// Fetch and update data for Total Products Chart
async function updateTotalProductsChart() {
    const chartContainer = document.getElementById("totalProductsChart");
    if (!chartContainer) {
        console.error("Total products chart container not found");
        return;
    }

    // Show loading state
    chartContainer.style.opacity = "0.5";

    const token = localStorage.getItem("sellerAuthToken");
    if (!token) {
        window.location.href = "seller.html";
        return;
    }

    try {
        // First get the products list
        const productsResponse = await fetch(`${getAPIURL()}/products`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        if (!productsResponse.ok) {
            throw new Error(`Server responded with ${productsResponse.status}`);
        }
        const products = await productsResponse.json();

        // Then get categories
        const categoryResponse = await fetch(`${getAPIURL()}/categories`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        if (!categoryResponse.ok) {
            throw new Error(`Failed to fetch categories: ${categoryResponse.status}`);
        }
        const categories = await categoryResponse.json();

        const categoryMap = {};
        categories.forEach(category => {
            categoryMap[category._id] = category.name;
        });

        const categoryCount = {};
        products.forEach(product => {
            const categoryName = categoryMap[product.categoryId] || "Unknown";
            categoryCount[categoryName] = (categoryCount[categoryName] || 0) + 1;
        });

        const labels = Object.keys(categoryCount).map(category => `${category} (${categoryCount[category]})`);
        const data = Object.values(categoryCount);

        renderTotalProductsChart(labels, data);
    } catch (error) {
        console.error("Error fetching Total Products data:", error);
    }
}

//USERS 
async function fetchUsers() {
    console.log("✅ fetchUsers() function was called!");
    const token = localStorage.getItem("sellerAuthToken");
    try {
        const response = await fetch(`${getAPIURL()}/dashboard/users`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (handleAuthErrors(response)) return;
        if (response.status === 401) {
            alert("Unauthorized. Please login again as a seller.");
            window.location.href = "seller.html";
            return;
        }
        const users = await response.json();
        console.log("✅ Users received:", users); // Debug log to check response

        const userList = document.getElementById("userList");
        if (!userList) {
            console.error("❌ userList element is missing in HTML!");
            return;
        }
        userList.innerHTML = ""; // Clear previous data

        if (!Array.isArray(users) || users.length === 0) {
            userList.innerHTML = '<p style="color:#dc3545;">No users found or you do not have access.</p>';
            return;
        }

        users.forEach(user => {
            const userDiv = document.createElement("div");
            userDiv.className = "user-card";
            const status = user?.status || "Unknown";
            userDiv.innerHTML = `
                <p><strong>Name:</strong> ${user.name}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Phone:</strong> ${user.phone}</p>
                <p><strong>Status:</strong> ${status}</p>
                <p><strong>Joined:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}</p>
            `;
            userList.appendChild(userDiv);
        });

        console.log("✅ userList after updating:", userList.innerHTML); // Debug log
        openPopup("viewUsersPopup"); // ✅ Ensure popup is being opened
    } catch (error) {
        console.error("❌ Error fetching users:", error);
        const userList = document.getElementById("userList");
        if (userList) {
            userList.innerHTML = '<p style="color:#dc3545;">Error fetching users. Please try again later.</p>';
        }
    }
}

async function searchUsers() {
    const query = document.getElementById("searchUser").value;
    const token = localStorage.getItem("sellerAuthToken");
    try {
        const response = await fetch(`${getAPIURL()}/dashboard/users/search?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (handleAuthErrors(response)) return;
        if (response.status === 401) {
            alert("Unauthorized. Please login again as a seller.");
            window.location.href = "seller.html";
            return;
        }
        const users = await response.json();
        const manageUserList = document.getElementById("manageUserList");
        manageUserList.innerHTML = "";
        if (!Array.isArray(users) || users.length === 0) {
            manageUserList.innerHTML = '<p style="color:#dc3545;">No users found.</p>';
            return;
        }
        users.forEach(user => {
            const userDiv = document.createElement("div");
            userDiv.className = "user-card";
            userDiv.innerHTML = `
                <p>${user.name} - ${user.email} - ${user.phone}</p>
                <button onclick="toggleBlockUser('${user._id}')">${user.status === "active" ? "Block" : "Unblock"}</button>
                <button onclick="deleteUser('${user._id}')">Delete</button>
            `;
            manageUserList.appendChild(userDiv);
        });
    } catch (error) {
        console.error("❌ Error searching users:", error);
        const manageUserList = document.getElementById("manageUserList");
        if (manageUserList) {
            manageUserList.innerHTML = '<p style="color:#dc3545;">Error searching users. Please try again later.</p>';
        }
    }
}

const updateBtn = document.getElementById("updateStatusBtn");

async function loadOrders() {
    const token = localStorage.getItem('sellerAuthToken');
    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = '<p>Loading orders...</p>';
  
    if (!token) {
      alert("Unauthorized. Please login again.");
      location.href = "seller.html";
      return;
    }
  
    try {
      const res = await fetch(`${getAPIURL()}/dashboard/all-orders`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
  
      if (res.status === 401) {
        alert("Unauthorized. Please login again.");
        location.href = "seller.html";
        return;
      }
  
      const data = await res.json();
  
      if (!data || !Array.isArray(data)) {
        ordersList.innerHTML = '<p>No orders found.</p>';
        return;
      }
  
      ordersList.innerHTML = '';
      data.forEach(order => {
          const div = document.createElement('div');
          div.className = 'order-card';
          div.innerHTML = `
              <div class="order-header">
                <div class="order-checkbox">
                  <input type="checkbox" class="order-select" data-order-id="${order._id}" onchange="updateSelectedCount()">
                </div>
                <div class="order-info">
                  <h4>Mongo Object ID: ${order._id}</h4> <!-- Display MongoDB Object ID -->
                  <h4>Order ID: ${order.orderId || 'N/A'}</h4> <!-- Display user-friendly Order ID -->
                  <p><strong>Tracking ID:</strong> ${order.trackingId || 'N/A'}</p>
                  <p><strong>Courier Partner:</strong> ${order.courierPartner || 'N/A'}</p>
                  <p><strong>Customer:</strong> ${order.userName || 'N/A'}</p>
                  <p><strong>Final Payable:</strong> <strong>₹${order.finalTotal}</strong></p>
                  <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
                  <p class="payment-status status-${order.paymentStatus.toLowerCase()}">Payment: ${order.paymentStatus}</p>
                  <p><strong>Placed On:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
                  <p class="order-status status-${order.orderStatus.toLowerCase()}">Status: ${order.orderStatus}</p>
                </div>
                <div class="order-actions">
                  <button class="viewOrderBtn" data-order-id="${order._id}">View</button>
                  <button class="generateInvoiceBtn" onclick="generateSingleInvoice('${order._id}')" title="Generate Invoice">
                    📄 Invoice
                  </button>
                </div>
              </div>
          `;
          ordersList.appendChild(div);
      });
      

  
      attachViewButtons();
    } catch (err) {
      console.error('Error loading orders:', err);
      ordersList.innerHTML = '<p>Error loading orders. Please try again.</p>';
    }
  }
  
  function attachViewButtons() {
    document.querySelectorAll(".viewOrderBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-order-id");
        openPopup('orderDetailsPopup');

        await loadOrderDetails(orderId);
      });
    });
  }
  

  async function loadOrderDetails(orderId) {
    const token = localStorage.getItem('sellerAuthToken');
    try {
      const res = await fetch(`${getAPIURL()}/dashboard/order/${orderId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
  
      const order = await res.json();
  
      if (!order || !order._id) {
        orderDetailsContainer.innerHTML = "<p>Order not found.</p>";
        return;
      }
  
      console.log("Fetched order details:", order);
  
      const address = order.shippingAddress || {};
      const formattedAddress = `
        ${address.street || ''}, ${address.city || ''},<br>
        ${address.state || ''}, ${address.zipcode || ''},<br>
        ${address.country || ''}
      `;
      
      // Check if coordinates exist
      const hasCoordinates = address.latitude && address.longitude;
      const coordinatesDisplay = hasCoordinates 
        ? `<p><strong>Coordinates:</strong> ${address.latitude}, ${address.longitude}</p>`
        : '<p><strong>Coordinates:</strong> Not available</p>';
      
      const mapButton = hasCoordinates 
        ? `<button onclick="openLocationMap(${address.latitude}, ${address.longitude})" class="map-btn">🗺️ View on Map</button>`
        : '';
      
      orderDetailsContainer.innerHTML = `
      <p><strong>Mongo Object ID:</strong> ${order._id}</p> <!-- Display MongoDB Object ID -->
       <h4>Order ID: ${order.orderId || 'N/A'}</h4> <!-- Display user-friendly Order ID -->
              <p><strong>Tracking ID:</strong> ${order.trackingId || 'N/A'}</p>
              <p><strong>Courier Partner:</strong> ${order.courierPartner || 'N/A'}</p>
      <p><strong>Status:</strong> ${order.orderStatus}</p>
      <p><strong>User:</strong> ${order.userName || 'N/A'} (${order.userEmail || ''})</p>
      <p><strong>Registered User:</strong> ${order.isRegisteredUser ? 'Yes' : 'No'}</p>
      <p><strong>Phone:</strong> ${order.userPhone || ''}</p>
     <p><strong>Original Total:</strong> ₹${order.totalPrice}</p>
<p><strong>Shipping Charges:</strong> ₹${order.shippingCharges || 0}</p>
<p><strong>Discount:</strong> -₹${order.discountAmount || 0}</p>
<p><strong>Final Payable:</strong> <strong>₹${order.finalTotal}</strong></p>
<p><strong>Applied Coupons:</strong> ${order.appliedCoupons?.length ? order.appliedCoupons.join(', ') : 'None'}</p>
<p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
  <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
<p><strong>Transaction ID:</strong> ${order.transactionId || 'N/A'}</p>
${order.paymentStatus === 'Refunded' ? `
  <h4>Refund Information:</h4>
  ${order.refundDetails ? `
    <p><strong>Refund ID:</strong> ${order.refundDetails.refundId}</p>
    <p><strong>Refund Amount:</strong> ₹${order.refundDetails.refundAmount}</p>
    <p><strong>Refund Date:</strong> ${new Date(order.refundDetails.refundDate).toLocaleString()}</p>
    <p><strong>Refund Reason:</strong> ${order.refundDetails.refundReason}</p>
  ` : ''}
  ${order.partialRefunds && order.partialRefunds.length > 0 ? `
    <h5>Partial Refunds:</h5>
    <ul>
      ${order.partialRefunds.map(refund => `
        <li>₹${refund.refundAmount} - ${refund.refundReason} (${new Date(refund.refundDate).toLocaleDateString()})</li>
      `).join('')}
    </ul>
    <p><strong>Total Refunded:</strong> ₹${order.totalRefunded || 0}</p>
  ` : ''}
` : ''}

      <p><strong>Ordered On:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
  
      <h4>Shipping Address:</h4>
      <p>${formattedAddress}</p>
      ${coordinatesDisplay}
      ${mapButton}
  
      <h4>Items:</h4>
      <ul>
          ${(order.orderItems || []).map(item => `
              <li>
                  ${item.name} - ₹${item.price} × ${item.quantity}
              </li>
          `).join('')}
      </ul>  
      <h4>Update Tracking Details:</h4>
      <div>
          <label for="trackingIdInput">Tracking ID:</label>
          <input type="text" id="trackingIdInput" value="${order.trackingId || ''}">
      </div>
      <div>
          <label for="courierPartnerInput">Courier Partner:</label>
          <input type="text" id="courierPartnerInput" value="${order.courierPartner || ''}">
      </div>
      
      <h4>Update Order Status:</h4>
      <div class="status-update-section">
        <label for="orderStatusSelect">Order Status:</label>
        <select id="orderStatusSelect">
          <option value="Pending">Pending</option>
          <option value="Processing">Processing</option>
          <option value="Shipped">Shipped</option>
          <option value="Delivered">Delivered</option>
          <option value="Canceled">Canceled</option>
        </select>
        <button id="updateStatusBtn" class="update-btn">Update Status</button>
      </div>
      
      <h4>Update Payment Status:</h4>
      <div class="status-update-section">
        <label for="paymentStatusSelect">Payment Status:</label>
        <select id="paymentStatusSelect">
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Failed">Failed</option>
          <option value="Refunded">Refunded</option>
        </select>
        <button id="updatePaymentStatusBtn" class="update-btn">Update Payment Status</button>
      </div>
  
  `;
  
  
      document.getElementById("orderStatusSelect").value = order.orderStatus;
      document.getElementById("paymentStatusSelect").value = order.paymentStatus;
      const updateBtn = document.getElementById("updateStatusBtn");
      const updatePaymentBtn = document.getElementById("updatePaymentStatusBtn");
      updateBtn.setAttribute("data-order-id", order._id);
      updatePaymentBtn.setAttribute("data-order-id", order._id);
  
    } catch (err) {
      console.error("Failed to load order", err);
      orderDetailsContainer.innerHTML = "<p>Something went wrong.</p>";
    }
  }

  async function searchOrderByFriendlyId() {
  const input = document.getElementById("orderSearchInput").value.trim();
  const token = localStorage.getItem("sellerAuthToken");

  if (!input) {
    alert("Please enter a valid Order ID.");
    return;
  }

  try {
    const response = await fetch(`${getAPIURL()}/dashboard/order-by-orderid/${input}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      document.getElementById("ordersList").innerHTML = `<p>No order found with Order ID: <strong>${input}</strong></p>`;
      return;
    }

    const order = await response.json();
document.getElementById("ordersList").innerHTML = renderOrderItem(order);

// Set the correct selected values for dropdowns
setTimeout(() => {
  const orderStatusSelect = document.getElementById('orderStatusSelect');
  const paymentStatusSelect = document.getElementById('paymentStatusSelect');
  
  if (orderStatusSelect) {
    orderStatusSelect.value = order.orderStatus || 'Pending';
  }
  
  if (paymentStatusSelect) {
    paymentStatusSelect.value = order.paymentStatus || 'Pending';
  }
  
  // Set data-order-id attributes for update buttons
  document.querySelectorAll('.update-btn').forEach(btn => {
    btn.setAttribute('data-order-id', order._id);
  });
}, 100);

  } catch (err) {
    console.error("Error:", err);
    document.getElementById("ordersList").innerHTML = `<p>Something went wrong while searching.</p>`;
  }
}
function renderOrderItem(order) {
  const address = order.shippingAddress || {};
  const formattedAddress = `
    ${address.street || ''}, ${address.city || ''},<br>
    ${address.state || ''}, ${address.zipcode || ''},<br>
    ${address.country || ''}
  `;

  // Check if coordinates exist
  const hasCoordinates = address.latitude && address.longitude;
  const coordinatesDisplay = hasCoordinates 
    ? `<p><strong>Coordinates:</strong> ${address.latitude}, ${address.longitude}</p>`
    : '<p><strong>Coordinates:</strong> Not available</p>';
  
  const mapButton = hasCoordinates 
    ? `<button onclick="openLocationMap(${address.latitude}, ${address.longitude})" class="map-btn">🗺️ View on Map</button>`
    : '';

  const itemsHTML = (order.orderItems || [])
    .map(item => `<li>${item.name} - ₹${item.price} × ${item.quantity}</li>`)
    .join('');

  const couponsHTML = (order.appliedCoupons || []).length
    ? `<p><strong>Applied Coupons:</strong> ${order.appliedCoupons.join(', ')}</p>`
    : '';

  return `
    <div class="order-details">
      <p><strong>Mongo Object ID:</strong> ${order._id}</p>
      <h4>Order ID: ${order.orderId}</h4>
      <p><strong>Tracking ID:</strong> ${order.trackingId}</p>
      <p><strong>Courier Partner:</strong> ${order.courierPartner}</p>
      <p><strong>Status:</strong> ${order.orderStatus}</p>
      <p><strong>User:</strong> ${order.userName || 'N/A'} (${order.userEmail || ''})</p>
      <p><strong>Registered User:</strong> ${order.isRegisteredUser ? 'Yes' : 'No'}</p>
      <p><strong>Phone:</strong> ${order.userPhone || ''}</p>
      <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
      <p><strong>Total Price:</strong> ₹${order.totalPrice}</p>
      <p><strong>Discount:</strong> ₹${order.discountAmount || 0}</p>
      <p><strong>Shipping Charges:</strong> ₹${order.shippingCharges || 0}</p>
      <p><strong>Final Total:</strong> ₹${order.finalTotal || order.totalPrice}</p>
      ${couponsHTML}
      <p><strong>Ordered On:</strong> ${new Date(order.createdAt).toLocaleString()}</p>

      <h4>Shipping Address:</h4>
      <p>${formattedAddress}</p>
      ${coordinatesDisplay}
      ${mapButton}

      <h4>Items:</h4>
      <ul>${itemsHTML}</ul>

      <h4>Update Tracking Details:</h4>
      <div>
          <label for="trackingIdInput">Tracking ID:</label>
          <input type="text" id="trackingIdInput" value="${order.trackingId !== "N/A" ? order.trackingId : ''}">
      </div>
      <div>
          <label for="courierPartnerInput">Courier Partner:</label>
          <input type="text" id="courierPartnerInput" value="${order.courierPartner !== "N/A" ? order.courierPartner : ''}">
      </div>

      <h4>Update Order Status:</h4>
      <div class="status-update-section">
        <label for="orderStatusSelect">Order Status:</label>
        <select id="orderStatusSelect">
          <option value="Pending">Pending</option>
          <option value="Processing">Processing</option>
          <option value="Shipped">Shipped</option>
          <option value="Delivered">Delivered</option>
          <option value="Canceled">Canceled</option>
        </select>
        <button id="updateStatusBtn" class="update-btn">Update Status</button>
      </div>
      
      <h4>Update Payment Status:</h4>
      <div class="status-update-section">
        <label for="paymentStatusSelect">Payment Status:</label>
        <select id="paymentStatusSelect">
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Failed">Failed</option>
          <option value="Refunded">Refunded</option>
        </select>
        <button id="updatePaymentStatusBtn" class="update-btn">Update Payment Status</button>
      </div>
    </div>
  `;
}

  
// Unified event delegation for both update buttons
document.addEventListener('click', async function(e) {
  const token = localStorage.getItem('sellerAuthToken');
  if (!token) {
    alert('Unauthorized. Please login again.');
    window.location.href = 'seller.html';
    return;
  }

  // Update order status handler
  if (e.target && e.target.id === 'updateStatusBtn') {
    const orderId = e.target.getAttribute('data-order-id');
    const newStatus = document.getElementById('orderStatusSelect').value;
    const trackingId = document.getElementById('trackingIdInput').value.trim();
    const courierPartner = document.getElementById('courierPartnerInput').value.trim();

    try {
      const res = await fetch(`${getAPIURL()}/dashboard/order/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, trackingId, courierPartner }),
      });
      const result = await res.json();
      if (res.ok) {
        alert('Order updated successfully!');
        closePopup();
        loadOrders();
      } else {
        alert(result.message || 'Failed to update order.');
      }
    } catch (err) {
      console.error('Error updating order:', err);
      alert('Something went wrong while updating the order.');
    }
  }

  // Update payment status handler
  if (e.target && e.target.id === 'updatePaymentStatusBtn') {
    const orderId = e.target.getAttribute('data-order-id');
    if (!orderId) {
      alert('Order ID not found.');
      return;
    }
    const newPaymentStatus = document.getElementById('paymentStatusSelect').value;

    try {
      const res = await fetch(`${getAPIURL()}/dashboard/order/${orderId}/payment-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentStatus: newPaymentStatus }),
      });
      const result = await res.json();

      if (res.ok) {
        alert('Payment status updated successfully!');
        closePopup();
        loadOrders();
      } else {
        alert(result.message || 'Failed to update payment status.');
      }
    } catch (err) {
      console.error('Error updating payment status:', err);
      alert('Something went wrong while updating the payment status.');
    }
  }
});
// ---------------------- Sales Report Logic ----------------------

// Global variable for sales chart
let salesChart;

async function fetchSalesReport(startDate = "", endDate = "") {
  const token = localStorage.getItem("sellerAuthToken");

  if (!token) {
    alert("Authentication required. Please login again.");
    window.location.href = "seller.html";
    return;
  }

  try {
    let url = `${getAPIURL()}/dashboard/sales-report`;
    
    // Debug: Log the parameters being sent
    console.log("🔍 Fetching sales report with:", { startDate, endDate });
    
    // Build query parameters properly
    const params = new URLSearchParams();
    if (startDate && endDate) {
      // Ensure dates are in proper format
      const start = new Date(startDate).toISOString().split('T')[0];
      const end = new Date(endDate).toISOString().split('T')[0];
      params.append('startDate', start);
      params.append('endDate', end);
      url += `?${params.toString()}`;
    }

    console.log("🔍 Final URL:", url);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to fetch sales report: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await res.json();
    console.log("🔍 Sales report data received:", data);
    
    renderSalesReport(data);
  } catch (err) {
    console.error("Sales report fetch error:", err);
    alert("Error fetching sales report: " + err.message);
  }
}

function renderSalesReport(data) {
  console.log("🔍 Rendering sales report with data:", data);
  
  // Summary values
  const totalRevenueEl = document.getElementById("totalRevenue");
  const totalOrdersEl = document.getElementById("reportTotalOrders");
  const averageOrderValueEl = document.getElementById("averageOrderValue");
  const totalProductsSoldEl = document.getElementById("totalProductsSold");
  const topProductsListEl = document.getElementById("topProductsList");

  if (!totalRevenueEl || !totalOrdersEl || !averageOrderValueEl || !totalProductsSoldEl || !topProductsListEl) {
    console.warn("🔍 Some sales report elements are missing in DOM.");
    return;
  }

  // Update summary cards with better formatting
  totalRevenueEl.textContent = `₹${(data.totalRevenue || 0).toLocaleString('en-IN')}`;
  totalOrdersEl.textContent = (data.totalOrders || 0).toLocaleString();
  averageOrderValueEl.textContent = `₹${(data.averageOrderValue || 0).toFixed(2)}`;
  totalProductsSoldEl.textContent = (data.totalProductsSold || 0).toLocaleString();

  // Render order status breakdown
  if (data.orders && Array.isArray(data.orders)) {
    renderOrderStatusBreakdown(data.orders);
  }

  // Render top products list
  topProductsListEl.innerHTML = ""; // clear previous
  if (Array.isArray(data.topProducts) && data.topProducts.length) {
    data.topProducts.forEach((prod, index) => {
      const item = document.createElement("div");
      item.className = "top-product-item";
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
          <span class="rank" style="font-weight: bold; color: #007bff;">${index + 1}.</span>
          <span class="product-name" style="flex: 1; margin-left: 10px;">${prod.name}</span>
          <span class="quantity" style="color: #28a745;">${prod.quantity} sold</span>
          <span class="revenue" style="font-weight: bold; color: #dc3545;">₹${(prod.revenue || 0).toLocaleString('en-IN')}</span>
        </div>
      `;
      topProductsListEl.appendChild(item);
    });
  } else {
    topProductsListEl.innerHTML = '<p class="no-data" style="text-align: center; color: #999; padding: 20px;">No top selling products in this range.</p>';
  }

  // Generate chart data from the response
  if (data.orders && Array.isArray(data.orders)) {
    generateAndRenderChart(data.orders);
  } else {
    console.warn("🔍 No orders data available for chart");
    // Clear existing chart if no data
    if (salesChart) {
      salesChart.destroy();
      salesChart = null;
    }
  }
}

// Function to render order status breakdown
function renderOrderStatusBreakdown(orders) {
  console.log("🔍 Analyzing order statuses:", orders.length, "total orders");
  
  // Count orders by status
  const statusBreakdown = {};
  const paymentStatusBreakdown = {};
  
  orders.forEach(order => {
    const orderStatus = order.orderStatus || 'Unknown';
    const paymentStatus = order.paymentStatus || 'Unknown';
    
    statusBreakdown[orderStatus] = (statusBreakdown[orderStatus] || 0) + 1;
    paymentStatusBreakdown[paymentStatus] = (paymentStatusBreakdown[paymentStatus] || 0) + 1;
  });
  
  console.log("🔍 Order Status Breakdown:", statusBreakdown);
  console.log("🔍 Payment Status Breakdown:", paymentStatusBreakdown);
  
  // Find or create breakdown container
  let breakdownContainer = document.getElementById('orderStatusBreakdown');
  if (!breakdownContainer) {
    // Create the container if it doesn't exist
    const salesSummary = document.getElementById('salesSummary');
    if (salesSummary) {
      breakdownContainer = document.createElement('div');
      breakdownContainer.id = 'orderStatusBreakdown';
      breakdownContainer.className = 'order-status-breakdown';
      breakdownContainer.innerHTML = '<h3>📋 Order Status Breakdown</h3>';
      salesSummary.insertAdjacentElement('afterend', breakdownContainer);
    } else {
      console.warn('🔍 Could not find sales summary container for order breakdown');
      return;
    }
  }
  
  // Clear previous content (except the title)
  const title = breakdownContainer.querySelector('h3');
  breakdownContainer.innerHTML = '';
  if (title) {
    breakdownContainer.appendChild(title);
  }
  
  // Create status breakdown section
  const statusSection = document.createElement('div');
  statusSection.className = 'status-section';
  statusSection.innerHTML = '<h4>Order Status</h4>';
  
  Object.entries(statusBreakdown).forEach(([status, count]) => {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin: 4px 0; background: #f8f9fa; border-left: 4px solid ${getStatusColor(status)}; border-radius: 4px;">
        <span style="font-weight: 500;">${status}</span>
        <span style="font-weight: bold; color: ${getStatusColor(status)};">${count} orders</span>
      </div>
    `;
    statusSection.appendChild(statusItem);
  });
  
  // Create payment status breakdown section
  const paymentSection = document.createElement('div');
  paymentSection.className = 'payment-section';
  paymentSection.innerHTML = '<h4>Payment Status</h4>';
  paymentSection.style.marginTop = '20px';
  
  Object.entries(paymentStatusBreakdown).forEach(([status, count]) => {
    const paymentItem = document.createElement('div');
    paymentItem.className = 'payment-item';
    paymentItem.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin: 4px 0; background: #f8f9fa; border-left: 4px solid ${getPaymentStatusColor(status)}; border-radius: 4px;">
        <span style="font-weight: 500;">${status}</span>
        <span style="font-weight: bold; color: ${getPaymentStatusColor(status)};">${count} orders</span>
      </div>
    `;
    paymentSection.appendChild(paymentItem);
  });
  
  breakdownContainer.appendChild(statusSection);
  breakdownContainer.appendChild(paymentSection);
  
  // Add summary info
  const summaryInfo = document.createElement('div');
  summaryInfo.className = 'breakdown-summary';
  summaryInfo.innerHTML = `
    <div style="margin-top: 15px; padding: 10px; background: #e9ecef; border-radius: 6px; text-align: center;">
      <strong>Total Orders Analyzed: ${orders.length}</strong>
    </div>
  `;
  breakdownContainer.appendChild(summaryInfo);
}

// Helper function to get color for order status
function getStatusColor(status) {
  const colors = {
    'Pending': '#ffc107',
    'Processing': '#17a2b8',
    'Shipped': '#007bff',
    'Delivered': '#28a745',
    'Canceled': '#dc3545',
    'Cancelled': '#dc3545',
    'Unknown': '#6c757d'
  };
  return colors[status] || '#6c757d';
}

// Helper function to get color for payment status
function getPaymentStatusColor(status) {
  const colors = {
    'Pending': '#ffc107',
    'Paid': '#28a745',
    'Failed': '#dc3545',
    'Refunded': '#17a2b8',
    'Unknown': '#6c757d'
  };
  return colors[status] || '#6c757d';
}

// Generate chart data from orders
function generateAndRenderChart(orders) {
  if (!orders || orders.length === 0) {
    console.warn("🔍 No orders to generate chart data");
    return;
  }

  // Group orders by date
  const ordersByDate = {};
  orders.forEach(order => {
    const date = new Date(order.createdAt).toISOString().split('T')[0];
    if (!ordersByDate[date]) {
      ordersByDate[date] = {
        count: 0,
        revenue: 0
      };
    }
    ordersByDate[date].count++;
    ordersByDate[date].revenue += order.finalTotal || order.totalPrice || 0;
  });

  // Sort dates and create chart data
  const sortedDates = Object.keys(ordersByDate).sort();
  const labels = sortedDates.map(date => new Date(date).toLocaleDateString('en-IN'));
  const orderCounts = sortedDates.map(date => ordersByDate[date].count);
  const revenueData = sortedDates.map(date => ordersByDate[date].revenue);

  console.log("🔍 Chart data:", { labels, orderCounts, revenueData });
  renderSalesChart(labels, orderCounts, revenueData);
}

// Function to render the sales chart
function renderSalesChart(labels, orderCounts, revenueData) {
  const ctx = document.getElementById("salesChart");
  if (!ctx) {
    console.error("🔍 Sales chart canvas element not found");
    return;
  }

  if (salesChart) {
    salesChart.destroy();
  }

  salesChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Orders",
          data: orderCounts,
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.1)",
          borderWidth: 2,
          fill: true,
          yAxisID: 'y',
          tension: 0.4
        },
        {
          label: "Revenue (₹)",
          data: revenueData,
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.1)",
          borderWidth: 2,
          fill: true,
          yAxisID: 'y1',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: 'Sales Performance Over Time',
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.datasetIndex === 1) {
                label += '₹' + context.parsed.y.toLocaleString('en-IN');
              } else {
                label += context.parsed.y;
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Number of Orders'
          },
          beginAtZero: true
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Revenue (₹)'
          },
          beginAtZero: true,
          grid: {
            drawOnChartArea: false,
          },
        }
      }
    }
  });
}

// Handle Generate Report button
document.getElementById("generateReportBtn").addEventListener("click", () => {
  const start = document.getElementById("startDate")?.value;
  const end = document.getElementById("endDate")?.value;

  if (!start || !end) {
    alert("Please select both start and end dates.");
    return;
  }

  fetchSalesReport(start, end);
});

// Optionally: fetch report when popup opens (for all-time data)
document.addEventListener("DOMContentLoaded", () => {
  const popup = document.getElementById("salesReportPopup");
  if (popup) {
    const observer = new MutationObserver(() => {
      if (popup.style.display === "block") {
        // Fetch all-time report when popup opened
        fetchSalesReport();
      }
    });
    observer.observe(popup, { attributes: true, attributeFilter: ["style"] });
  }
});

  // Initial call
  loadOrders();
  
// Add after DOMContentLoaded or initialization

document.addEventListener('DOMContentLoaded', function () {
  const totalRevenueEl = document.getElementById('totalRevenue');
  if (totalRevenueEl) {
    totalRevenueEl.style.cursor = 'pointer';
    totalRevenueEl.title = 'Click to view revenue chart';
    totalRevenueEl.addEventListener('click', openRevenueChartPopup);
  }
  const totalOrdersEl = document.getElementById('reportTotalOrders');
  if (totalOrdersEl) {
    totalOrdersEl.style.cursor = 'pointer';
    totalOrdersEl.title = 'Click to view order status breakdown';
    totalOrdersEl.addEventListener('click', openOrderStatusPopup);
  }
});

// Revenue Chart Popup logic
let revenueChartInstance = null;
let currentRevenueTimePeriod = 'month';

function openRevenueChartPopup() {
  // Show the popup
  const popup = document.getElementById('salesReportPopup');
  if (popup) popup.style.display = 'block';
  // Show only the chart and filter, hide other sections
  document.querySelector('.sales-summary').style.display = 'none';
  document.querySelector('.sales-filter-section').style.display = 'none';
  document.querySelector('.sales-chart-container').style.display = 'block';
  // Add filter buttons if not present
  let filterDiv = document.getElementById('revenueChartFilter');
  if (!filterDiv) {
    filterDiv = document.createElement('div');
    filterDiv.id = 'revenueChartFilter';
    filterDiv.style.display = 'flex';
    filterDiv.style.justifyContent = 'center';
    filterDiv.style.gap = '10px';
    filterDiv.style.margin = '10px 0';
    filterDiv.innerHTML = `
      <button onclick="changeRevenueChartPeriod('month')">Last 1 Month</button>
      <button onclick="changeRevenueChartPeriod('year')">Last 1 Year</button>
      <button onclick="changeRevenueChartPeriod('all')">All Time</button>
    `;
    document.querySelector('.sales-chart-container').insertAdjacentElement('beforebegin', filterDiv);
  }
  // Fetch and render chart
  fetchAndRenderRevenueChart(currentRevenueTimePeriod);
}

function closeRevenueChartPopup() {
  const popup = document.getElementById('salesReportPopup');
  if (popup) popup.style.display = 'none';
  // Restore other sections
  document.querySelector('.sales-summary').style.display = '';
  document.querySelector('.sales-filter-section').style.display = '';
  document.querySelector('.sales-chart-container').style.display = '';
  // Optionally destroy chart instance
  if (revenueChartInstance) {
    revenueChartInstance.destroy();
    revenueChartInstance = null;
  }
}

async function fetchAndRenderRevenueChart(timePeriod) {
  currentRevenueTimePeriod = timePeriod;
  const token = localStorage.getItem('sellerAuthToken');
  let url = `${getAPIURL()}/dashboard/sales-report?timePeriod=${timePeriod}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    alert('Failed to fetch revenue chart');
    return;
  }
  const data = await res.json();
  renderRevenueLineChart(data.revenueChart);
}

function changeRevenueChartPeriod(period) {
  fetchAndRenderRevenueChart(period);
}

function renderRevenueLineChart(chartData) {
  const ctx = document.getElementById('salesChart').getContext('2d');
  if (revenueChartInstance) revenueChartInstance.destroy();
  const labels = chartData.map(d => d.label);
  const revenue = chartData.map(d => d.revenue);
  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: revenue,
        borderColor: '#007bff',
        backgroundColor: 'rgba(0,123,255,0.1)',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Revenue Over Time' }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Revenue (₹)' } },
        x: { title: { display: true, text: 'Date/Period' } }
      }
    }
  });
}

// Optional: Close popup on close button
const closeBtn = document.querySelector('#salesReportPopup .close');
if (closeBtn) {
  closeBtn.addEventListener('click', closeRevenueChartPopup);
}

function openOrderStatusPopup() {
  // Show the popup
  const popup = document.getElementById('salesReportPopup');
  if (popup) popup.style.display = 'block';
  // Hide other sections, show only status cards
  document.querySelector('.sales-summary').style.display = 'none';
  document.querySelector('.sales-filter-section').style.display = 'none';
  document.querySelector('.sales-chart-container').style.display = 'none';
  // Add or update status cards container
  let statusDiv = document.getElementById('orderStatusCards');
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    statusDiv.id = 'orderStatusCards';
    statusDiv.style.display = 'flex';
    statusDiv.style.justifyContent = 'center';
    statusDiv.style.gap = '20px';
    statusDiv.style.margin = '20px 0';
    document.querySelector('#salesReportPopup .popup-content').appendChild(statusDiv);
  }
  // Fetch and render status cards
  fetchAndRenderOrderStatusCards();
}

function closeOrderStatusPopup() {
  const popup = document.getElementById('salesReportPopup');
  if (popup) popup.style.display = 'none';
  // Restore other sections
  document.querySelector('.sales-summary').style.display = '';
  document.querySelector('.sales-filter-section').style.display = '';
  document.querySelector('.sales-chart-container').style.display = '';
  // Optionally clear status cards
  let statusDiv = document.getElementById('orderStatusCards');
  if (statusDiv) statusDiv.innerHTML = '';
}

async function fetchAndRenderOrderStatusCards() {
  const token = localStorage.getItem('sellerAuthToken');
  let url = `${getAPIURL()}/dashboard/sales-report`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    alert('Failed to fetch order status breakdown');
    return;
  }
  const data = await res.json();
  renderOrderStatusCards(data.orderStatusCounts);
}

function renderOrderStatusCards(statusCounts) {
  let statusDiv = document.getElementById('orderStatusCards');
  if (!statusDiv) return;
  // FIX: Handle undefined/null statusCounts
  if (!statusCounts || typeof statusCounts !== 'object') {
    statusDiv.innerHTML = '<p style="color:#dc3545;">No order status data available.</p>';
    return;
  }
  statusDiv.innerHTML = '';
  const colors = {
    Delivered: '#28a745',
    Cancelled: '#dc3545',
    Pending: '#ffc107',
    Processing: '#17a2b8',
    Shipped: '#007bff',
    Refunded: '#6f42c1',
    Unknown: '#6c757d'
  };
  Object.entries(statusCounts).forEach(([status, count]) => {
    const card = document.createElement('div');
    card.style.background = colors[status] || '#f8f9fa';
    card.style.color = '#fff';
    card.style.padding = '20px';
    card.style.borderRadius = '8px';
    card.style.minWidth = '120px';
    card.style.textAlign = 'center';
    card.innerHTML = `<h4>${status}</h4><p style="font-size:2em; margin:0;">${count}</p>`;
    statusDiv.appendChild(card);
  });
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    const token = localStorage.getItem('sellerAuthToken');
    try {
        const res = await fetch(`${getAPIURL()}/dashboard/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Failed to delete user.');
            return;
        }
        // Remove user from the list
        searchUsers(); // Refresh the list
        alert('User deleted successfully.');
    } catch (error) {
        alert('Error deleting user. Please try again.');
    }
}

async function toggleBlockUser(userId) {
    const token = localStorage.getItem('sellerAuthToken');
    // Find the current status from the button text
    const btn = event.target;
    const isCurrentlyActive = btn.textContent.trim().toLowerCase() === 'block';
    const newStatus = isCurrentlyActive ? 'blocked' : 'active';
    if (!confirm(`Are you sure you want to ${isCurrentlyActive ? 'block' : 'unblock'} this user?`)) return;
    try {
        const res = await fetch(`${getAPIURL()}/dashboard/users/${userId}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Failed to update user status.');
            return;
        }
        // Refresh the list
        searchUsers();
        alert(data.message);
    } catch (error) {
        alert('Error updating user status. Please try again.');
    }
}

function handleAuthErrors(response) {
    if (response.status === 401) {
        response.json().then(data => {
            if (data.message && (data.message.includes('blocked') || data.message.includes('deleted'))) {
                alert(data.message);
                localStorage.removeItem('sellerAuthToken');
                window.location.href = 'seller.html';
            }
        });
        return true;
    }
    return false;
}

// Show chart for Total Sales
function showChart(type) {
  hideAllCharts();
  const chartControls = document.getElementById('chartControls');
  currentChartType = type;
  if (type === 'Sales') {
    document.getElementById('totalSalesChartContainer').style.display = 'block';
    chartControls.style.display = 'flex';
    updateTotalSalesChart(currentTimePeriod);
  } else if (type === 'Orders') {
    document.getElementById('totalOrdersChartContainer').style.display = 'block';
    chartControls.style.display = 'flex';
    updateTotalOrdersChart();
  } else if (type === 'Users') {
    document.getElementById('userGrowthSection').style.display = 'block';
    chartControls.style.display = 'flex';
    updateUserGrowthChart();
  } else if (type === 'Products') {
    document.getElementById('totalProductsChartContainer').style.display = 'block';
    chartControls.style.display = 'flex';
    updateTotalProductsChart();
  }
}

function changeTimePeriod(period) {
  currentTimePeriod = period;
  if (currentChartType === 'Sales') {
    updateTotalSalesChart(currentTimePeriod);
  } else if (currentChartType === 'orders') {
    updateTotalOrdersChart();
  } else if (currentChartType === 'products') {
    updateTotalProductsChart();
  } else if (currentChartType === 'growth') {
    updateUserGrowthChart();
  }
}

let totalSalesChart;
async function updateTotalSalesChart(timePeriod = 'month') {
  // Map frontend values to backend values
  if (timePeriod === 'monthly') timePeriod = 'month';
  if (timePeriod === 'yearly') timePeriod = 'year';
  const token = localStorage.getItem('sellerAuthToken');
  let url = `${getAPIURL()}/dashboard/revenue-chart?timePeriod=${timePeriod}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    alert('Failed to fetch sales chart');
    return;
  }
  const { labels, data } = await res.json();
  renderTotalSalesChart(labels, data);
}
function renderTotalSalesChart(labels, data) {
  const ctx = document.getElementById('totalSalesChart').getContext('2d');
  if (totalSalesChart) totalSalesChart.destroy();
  totalSalesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data,
        borderColor: '#007bff',
        backgroundColor: 'rgba(0,123,255,0.1)',
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Revenue Over Time' }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Revenue (₹)' } },
        x: { title: { display: true, text: 'Date/Period' } }
      }
    }
  });
}

// ✅ Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CheckoutManager, APIService, Utils, SecurityUtils };
}

// Function to open location on map
function openLocationMap(latitude, longitude) {
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=15`;
  window.open(mapUrl, '_blank');
}

// ✅ INVOICE MANAGEMENT FUNCTIONS

/**
 * Toggle select all orders checkbox
 */
function toggleSelectAllOrders() {
  const selectAllCheckbox = document.getElementById('selectAllOrders');
  const orderCheckboxes = document.querySelectorAll('.order-select');
  
  orderCheckboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
  });
  
  updateSelectedCount();
}

/**
 * Update the count of selected orders
 */
function updateSelectedCount() {
  const selectedCheckboxes = document.querySelectorAll('.order-select:checked');
  const selectedCount = selectedCheckboxes.length;
  const generateBtn = document.getElementById('generateInvoicesBtn');
  
  document.getElementById('selectedCount').textContent = `${selectedCount} orders selected`;
  generateBtn.disabled = selectedCount === 0;
}

/**
 * Generate single invoice for an order
 */
async function generateSingleInvoice(orderId) {
  try {
    showMessage('Generating invoice...', 'info');
    
    const token = localStorage.getItem('sellerAuthToken');
    const response = await fetch(`${getAPIURL()}/invoices/generate/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to generate invoice');
    }

    // Get the PDF blob
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${orderId}-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showMessage('Invoice generated successfully!', 'success');
    
  } catch (error) {
    console.error('Invoice generation error:', error);
    showMessage(`Failed to generate invoice: ${error.message}`, 'error');
  }
}

/**
 * Generate bulk invoices for selected orders
 */
async function generateBulkInvoices() {
  try {
    const selectedCheckboxes = document.querySelectorAll('.order-select:checked');
    const orderIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.getAttribute('data-order-id'));
    
    if (orderIds.length === 0) {
      showMessage('Please select orders to generate invoices', 'warning');
      return;
    }
    
    showMessage(`Generating ${orderIds.length} invoices...`, 'info');
    
    const token = localStorage.getItem('sellerAuthToken');
    const response = await fetch(`${getAPIURL()}/invoices/bulk-generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderIds })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to generate bulk invoices');
    }

    // Get the PDF blob
    const blob = await response.blob();
    
    // Create download link for PDF
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bulk-Invoices-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showMessage(`${orderIds.length} invoices generated successfully!`, 'success');
    
    // Reset selection
    document.getElementById('selectAllOrders').checked = false;
    orderIds.forEach(orderId => {
      const checkbox = document.querySelector(`[data-order-id="${orderId}"]`);
      if (checkbox) checkbox.checked = false;
    });
    updateSelectedCount();
    
  } catch (error) {
    console.error('Bulk invoice generation error:', error);
    showMessage(`Failed to generate bulk invoices: ${error.message}`, 'error');
  }
}

/**
 * Semi-Automated Mail Service Functions
 */

// Global variables for template data and user selection
let currentTemplate = null;
let templateVariables = [];
let allUsers = [];
let selectedUserIds = [];

/**
 * Step 1: Template Validation
 * Validates the uploaded JSON template file or direct template JSON input
 */
async function validateTemplate() {
  try {
    const fileInput = document.getElementById('templateFile');
    
    // Reset validation
    currentTemplate = null;
    document.getElementById('proceedStep1').disabled = true;
    document.getElementById('templatePreview').style.display = 'none';
    
    if (!fileInput.files || fileInput.files.length === 0) {
      showMessage('Please select a template file', 'warning');
      return;
    }
    
    const templateFile = fileInput.files[0];
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('template', templateFile);
    
    // Call API to validate template
    const token = localStorage.getItem('sellerAuthToken');
    const response = await fetch(`${getAPIURL()}/emails/validate-template`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Template validation failed');
    }
    
    const result = await response.json();
    
    if (result.valid) {
      // Store the validated template
      currentTemplate = result.template;
      templateVariables = result.variables || [];
      
      // Show template preview
      displayTemplatePreview(currentTemplate, templateVariables);
      
      // Enable the proceed button
      document.getElementById('proceedStep1').disabled = false;
      
      showMessage('Template validated successfully!', 'success');
    } else {
      throw new Error(result.error || 'Invalid template format');
    }
  } catch (error) {
    console.error('Template validation error:', error);
    showMessage(`Template validation failed: ${error.message}`, 'error');
  }
}

/**
 * Displays the validated template in the preview section
 */
function displayTemplatePreview(template, variables) {
  const previewDiv = document.getElementById('templatePreview');
  const detailsDiv = document.getElementById('templateDetails');
  
  let variablesHtml = '';
  if (variables && variables.length > 0) {
    variablesHtml = `
      <div class="template-variables">
        <h5>Template Variables:</h5>
        <ul>
          ${variables.map(v => `<li>${v}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Create HTML for template preview
  detailsDiv.innerHTML = `
    <div class="template-subject">
      <strong>Subject:</strong> ${template.subject}
    </div>
    <div class="template-content-preview">
      <strong>Content Preview:</strong>
      <div class="content-preview">${template.content.substring(0, 300)}${template.content.length > 300 ? '...' : ''}</div>
    </div>
    ${variablesHtml}
  `;
  
  // Show the preview
  previewDiv.style.display = 'block';
}

/**
 * Proceed to Step 2: Recipient Selection
 */
function proceedToStep2() {
  // Hide step 1, show step 2
  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'block';
  
  // Load users for selection
  loadUsersForSelection();
  
  // Set up variables section if needed
  if (templateVariables && templateVariables.length > 0) {
    setupVariablesSection(templateVariables);
  }
  
  // Enable/disable send button based on selections
  updateSendButtonState();
}

/**
 * Go back to Step 1: Template Selection
 */
function backToStep1() {
  // Hide step 2, show step 1
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
}

/**
 * Load all active users for recipient selection
 */
async function loadUsersForSelection() {
  try {
    const token = localStorage.getItem('sellerAuthToken');
    const response = await fetch(`${getAPIURL()}/emails/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load users');
    }
    
    const data = await response.json();
    allUsers = data.users || [];
    
    // Display users in the selection list
    displayUsersList(allUsers);
    
  } catch (error) {
    console.error('Error loading users:', error);
    document.getElementById('usersList').innerHTML = `
      <div class="error-message">Failed to load users: ${error.message}</div>
    `;
  }
}

/**
 * Display users in the selection list
 */
function displayUsersList(users) {
  const usersListDiv = document.getElementById('usersList');
  
  if (!users || users.length === 0) {
    usersListDiv.innerHTML = '<p>No active users found</p>';
    document.getElementById('usersCount').textContent = '0 users';
    return;
  }
  
  // Create HTML for user checkboxes - FIXED: Use email as unique identifier
  const usersHtml = users.map(user => `
    <div class="user-item">
      <label>
        <input type="checkbox" class="user-select" value="${user.email}" onchange="updateSelectedUsers()">
        ${user.name} (${user.email})
      </label>
    </div>
  `).join('');
  
  usersListDiv.innerHTML = usersHtml;
  document.getElementById('usersCount').textContent = `${users.length} users`;
}

/**
 * Toggle selection of all users
 */
function toggleAllUsers() {
  const selectAllCheckbox = document.getElementById('selectAllUsers');
  const userCheckboxes = document.querySelectorAll('.user-select');
  
  userCheckboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
  });
  
  updateSelectedUsers();
}

/**
 * Update the array of selected user IDs - FIXED: Now uses emails
 */
function updateSelectedUsers() {
  const userCheckboxes = document.querySelectorAll('.user-select:checked');
  selectedUserIds = Array.from(userCheckboxes).map(checkbox => checkbox.value);
  
  // Update the count display
  document.getElementById('usersCount').textContent = `${selectedUserIds.length} selected`;
  
  // Update select all checkbox state
  const selectAllCheckbox = document.getElementById('selectAllUsers');
  const allCheckboxes = document.querySelectorAll('.user-select');
  selectAllCheckbox.checked = userCheckboxes.length > 0 && userCheckboxes.length === allCheckboxes.length;
  
  // Enable/disable send button
  updateSendButtonState();
}

/**
 * Set up the variables section with input fields
 */
function setupVariablesSection(variables) {
  if (!variables || variables.length === 0) {
    document.getElementById('variablesSection').style.display = 'none';
    return;
  }
  
  const variablesDiv = document.getElementById('variableInputs');
  const variablesHtml = variables.map(variable => `
    <div class="variable-input">
      <label for="var-${variable}">${variable}:</label>
      <input type="text" id="var-${variable}" class="template-variable" data-var-name="${variable}">
    </div>
  `).join('');
  
  variablesDiv.innerHTML = variablesHtml;
  document.getElementById('variablesSection').style.display = 'block';
}

/**
 * Update the state of the send button based on selections
 */
function updateSendButtonState() {
  const sendButton = document.getElementById('sendEmailsBtn');
  const manualEmails = document.getElementById('manualEmails').value.trim();
  
  // Enable the send button if either users are selected or manual emails are provided
  sendButton.disabled = selectedUserIds.length === 0 && manualEmails === '';
}

/**
 * Send custom emails to selected recipients - FIXED: Now progresses to step 3
 */
async function sendCustomEmails() {
  try {
    // Show progress and hide step 2
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'block';
    document.getElementById('sendingProgress').style.display = 'block';
    document.getElementById('sendingResults').style.display = 'none';
    
    // Step 1: Collect selected users (now using emails directly)
    const selectedUserEmails = [...selectedUserIds]; // Already contains emails now
    
    // Step 2: Collect manual emails
    const manualEmailsText = document.getElementById('manualEmails').value.trim();
    const manualEmails = manualEmailsText
      ? manualEmailsText.split(/[,\n]/).map(e => e.trim()).filter(e => e)
      : [];

    // Step 3: Merge and deduplicate emails
    const allRecipientEmails = [...new Set([...selectedUserEmails, ...manualEmails])];
    if (allRecipientEmails.length === 0) throw new Error('No valid email addresses provided');

    // Step 4: Collect template variables
    const variableInputs = document.querySelectorAll('.template-variable');
    const variables = {};
    variableInputs.forEach(input => {
      const varName = input.getAttribute('data-var-name');
      variables[varName] = input.value.trim();
    });

    // Step 5: Prepare payload
    const requestData = {
      template: currentTemplate,
      recipientEmails: allRecipientEmails,
      variables
    };

    // Step 6: Send request
    const token = localStorage.getItem('sellerAuthToken');
    const response = await fetch(`${getAPIURL()}/emails/send-custom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    const result = await response.json();

    // Step 7: Display results in step 3
    displaySendingResults({
      success: response.ok,
      successCount: result.stats?.successful || 0,
      failureCount: result.stats?.failed || 0,
      totalCount: result.stats?.total || allRecipientEmails.length,
      error: response.ok ? null : result.message || 'Failed to send emails'
    });

  } catch (error) {
    console.error('❌ Error sending emails:', error);
    displaySendingResults({
      success: false,
      error: error.message,
      successCount: 0,
      failureCount: 0,
      totalCount: selectedUserIds.length + 
                  document.getElementById('manualEmails').value
                    .split(/[,\n]/)
                    .filter(e => e.trim() !== '').length
    });
  }
}

/**
 * Display the results of the email sending operation - FIXED: Now shows in step 3
 */
function displaySendingResults(result) {
  // Hide progress, show results in step 3
  document.getElementById('sendingProgress').style.display = 'none';
  document.getElementById('sendingResults').style.display = 'block';
  document.querySelector('.final-actions').style.display = 'flex';
  
  const resultsDiv = document.getElementById('sendingResults');
  
  if (result.success) {
    resultsDiv.innerHTML = `
      <div class="success-result">
        <h4>✅ Emails Sent Successfully</h4>
        <div class="stats">
          <div class="stat">
            <span class="stat-value">${result.successCount}</span>
            <span class="stat-label">Successful</span>
          </div>
          <div class="stat">
            <span class="stat-value">${result.failureCount}</span>
            <span class="stat-label">Failed</span>
          </div>
          <div class="stat">
            <span class="stat-value">${result.totalCount}</span>
            <span class="stat-label">Total</span>
          </div>
        </div>
      </div>
    `;
  } else {
    resultsDiv.innerHTML = `
      <div class="error-result">
        <h4>❌ Failed to Send Emails</h4>
        <p>${result.error || 'An unknown error occurred'}</p>
        <div class="stats">
          <div class="stat">
            <span class="stat-value">${result.successCount}</span>
            <span class="stat-label">Successful</span>
          </div>
          <div class="stat">
            <span class="stat-value">${result.failureCount}</span>
            <span class="stat-label">Failed</span>
          </div>
          <div class="stat">
            <span class="stat-value">${result.totalCount}</span>
            <span class="stat-label">Total</span>
          </div>
        </div>
      </div>
    `;
  }
}

/**
 * Reset the mail service to send another email
 */
function resetMailService() {
  // Reset global variables
  currentTemplate = null;
  templateVariables = [];
  selectedUserIds = [];
  
  // Reset UI elements
  document.getElementById('templateFile').value = '';
  document.getElementById('templatePreview').style.display = 'none';
  document.getElementById('proceedStep1').disabled = true;
  document.getElementById('selectAllUsers').checked = false;
  document.getElementById('manualEmails').value = '';
  document.getElementById('variableInputs').innerHTML = '';
  document.getElementById('variablesSection').style.display = 'none';
  document.getElementById('sendEmailsBtn').disabled = true;
  
  // Reset steps
  document.getElementById('step3').style.display = 'none';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
}

// Add event listeners for the email functionality when the page loads
document.addEventListener('DOMContentLoaded', function() {
  // Initialize manual emails field to update send button state
  const manualEmailsField = document.getElementById('manualEmails');
  if (manualEmailsField) {
    manualEmailsField.addEventListener('input', updateSendButtonState);
  }
});
