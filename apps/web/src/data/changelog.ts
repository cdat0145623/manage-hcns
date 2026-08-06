export type ChangelogChangeType = "added" | "changed" | "fixed";

export interface ChangelogSection {
  type: ChangelogChangeType;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

// Update this value and add a new entry at the top for each release.
export const APP_VERSION = "1.0.2";

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: APP_VERSION,
    date: "2026-08-05",
    sections: [
      {
        type: "added",
        items: [
          "Hỗ trợ phân quyền owner riêng cho board trong workspace.",
          "Admin có thể tạo board cho thành viên khác và tìm kiếm người dùng khi chọn owner.",
          "Xem trước file PDF và Markdown trực tiếp trong card.",
        ],
      },
      {
        type: "changed",
        items: [
          "Hiển thị đúng owner của board trong danh sách và trang board.",
          "Tự động gán owner của board làm thành viên khi tạo card mới.",
          "Cải thiện hiển thị ngày hiện tại trên lịch và đóng dropdown sau khi chọn thao tác.",
        ],
      },
      {
        type: "fixed",
        items: [
          "Xử lý an toàn các ngày không hợp lệ trong activity và định dạng ngày bắt đầu.",
          "Cập nhật kiểm tra tên board theo workspace, owner và trạng thái lưu trữ.",
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-08-04",
    sections: [
      {
        type: "added",
        items: [
          "Hệ thống khấu trừ thưởng cho các trường hợp hoàn thành trễ hoặc thay đổi deadline.",
          "Cấu hình thưởng theo task instance và task master.",
          "API công khai để tra cứu kết quả thưởng theo tháng.",
          "Quy trình build, push và deploy Docker có migrator riêng.",
        ],
      },
      {
        type: "changed",
        items: [
          "Cải thiện xử lý timezone và ngày tháng trên lịch, task và card.",
          "Mở rộng giao diện cấu hình, duyệt và chốt thưởng.",
          "Chuẩn hóa Docker deployment và buộc giao diện ứng dụng dùng light theme.",
        ],
      },
      {
        type: "fixed",
        items: [
          "Sửa lỗi build web image và khởi động ứng dụng trong môi trường Docker.",
          "Sửa các vấn đề trong luồng review reward và báo cáo reward.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2025-06-02",
    sections: [
      {
        type: "added",
        items: [
          "Quản lý workspace, board, list và card.",
          "Xác thực người dùng và cộng tác trong workspace.",
          "Theo dõi hoạt động và bình luận trên card.",
        ],
      },
    ],
  },
];
