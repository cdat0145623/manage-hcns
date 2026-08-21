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
export const APP_VERSION = "1.0.6";

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: APP_VERSION,
    date: "2026-08-21",
    sections: [
      {
        type: "added",
        items: [
          "Tạo card project với mô tả, thành viên, nhãn, ngày bắt đầu và deadline ngay trong modal.",
          "Thêm mức độ ưu tiên cho card project và hiển thị thông tin danh sách, nhãn cùng deadline của công việc con.",
          "Hỗ trợ checklist trong card project với cập nhật tức thời khi thêm checklist hoặc mục checklist.",
        ],
      },
      {
        type: "changed",
        items: [
          "Cải thiện quyền truy cập card project để thành viên chỉ xem được các card được giao, đồng thời admin vẫn xem đầy đủ board.",
          "Cải thiện modal tạo card và đồng bộ dữ liệu board sau các thao tác trên card, checklist và trường planning.",
        ],
      },
    ],
  },
  {
    version: "1.0.5",
    date: "2026-08-20",
    sections: [
      {
        type: "added",
        items: [
          "Quản lý cột project board với thao tác đổi tên, xóa và chọn cột hoàn thành có xác nhận.",
          "Đổi công việc cha, thêm checklist qua modal và hiển thị mã, nhãn, trạng thái cùng deadline của công việc con.",
          "Chọn nhanh màu cho từng lựa chọn trong nhóm nhãn tùy chỉnh.",
        ],
      },
      {
        type: "changed",
        items: [
          "Cải thiện kéo thả cột và card với cập nhật tức thời, khôi phục dữ liệu khi thao tác thất bại và giữ ổn định chiều cao card.",
          "Tự động đồng bộ trạng thái card khi tạo, di chuyển hoặc chuyển cột hoàn thành.",
          "Tối ưu cập nhật label và mô tả card để giao diện phản hồi nhanh hơn.",
        ],
      },
    ],
  },
  {
    version: "1.0.4",
    date: "2026-08-20",
    sections: [
      {
        type: "added",
        items: [
          "Project board riêng cho Scrum và các dự án cộng tác, không giới hạn theo tháng.",
          "Tạo card cha-con tối đa 3 cấp để phân rã công việc.",
          "Tự do thêm cột, thêm thành viên vào board và gán nhiều thành viên cho một card.",
          "Cấu hình workflow General hoặc Scrum, estimation theo story point hoặc giờ.",
          "Bật cycle tùy chọn, quản lý backlog và gán card vào cycle.",
          "Tùy chỉnh tối đa 3 nhóm nhãn cho card, hỗ trợ chọn một hoặc nhiều lựa chọn theo từng nhóm.",
          "Đặt mã project và tự động đánh số card để nhận diện công việc nhanh hơn, ví dụ PRO-1.",
        ],
      },
      {
        type: "changed",
        items: [
          "Project board không sử dụng cấu hình thưởng, giữ độc lập với board và calendar hiện tại.",
          "Mở rộng card detail với checklist, bình luận, file đính kèm, activity, deadline và cập nhật dữ liệu sau mỗi thao tác.",
          "Cải thiện điều hướng project, modal, dropdown, select và trạng thái focus để thao tác dễ dàng hơn.",
        ],
      },
    ],
  },
  {
    version: "1.0.3",
    date: "2026-08-18",
    sections: [
      {
        type: "added",
        items: [
          "Tô nền xanh để làm nổi bật các card đã hoàn thành.",
          "Tự động tạo các công việc hằng ngày từ lịch lặp và cập nhật trạng thái bỏ lỡ.",
        ],
      },
      {
        type: "changed",
        items: [
          "Cải thiện biểu đồ hiệu suất công việc hằng ngày với bố cục dễ đọc hơn, nhãn tỷ lệ và hỗ trợ tên task dài.",
          "Tự động đồng bộ công việc hằng ngày và trạng thái bỏ lỡ cùng máy chủ web production.",
        ],
      },
      {
        type: "fixed",
        items: [
          "Xếp các task trong lịch tuần theo từng giờ và tự động điều chỉnh chiều cao để tránh chồng lấn.",
          "Cải thiện kiểm tra quyền cập nhật và chuyển trạng thái công việc trong lịch.",
        ],
      },
    ],
  },
  {
    version: "1.0.2",
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
