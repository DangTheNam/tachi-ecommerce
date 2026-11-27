// Khởi tạo kết nối tới Supabase Cloud
const SUPABASE_URL = 'https://drjwrztayjttfgytvkob.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8owNi8edF1-xRuE6AqJw-w_U8qu3XR7';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hàm 1: Lấy danh sách sản phẩm từ Cloud về hiển thị lên Trang chủ
async function fetchProductsFromCloud() {
    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Lỗi lấy sản phẩm:', error);
        return [];
    }
    return data;
}

// Hàm 2: Thêm sản phẩm mới từ trang TaChi Seller lên Cloud
async function addProductToCloud(productObj) {
    const { data, error } = await supabaseClient
        .from('products')
        .insert([productObj])
        .select();

    if (error) {
        alert('Lỗi thêm sản phẩm: ' + error.message);
        return null;
    }
    alert('Đã đăng bán sản phẩm lên Cloud thành công!');
    return data;
}

// Hàm 3: Gửi đơn hàng từ khách mua lên Cloud
async function createOrderOnCloud(orderObj) {
    const { data, error } = await supabaseClient
        .from('orders')
        .insert([orderObj])
        .select();

    if (error) {
        alert('Đặt hàng thất bại: ' + error.message);
        return null;
    }
    alert('Đặt hàng thành công! Đơn hàng đã lưu trên hệ thống.');
    return data;
}