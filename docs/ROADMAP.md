# Roadmap

Định hướng cho MakerLens, rút ra từ việc đối chiếu với danh sách
[awesome-game-file-format-reversing](https://github.com/VelocityRa/awesome-game-file-format-reversing)
(mục RPG Maker và các trình xem asset chung). Các dự án được nhắc tới chỉ được
đọc qua mô tả một dòng trong danh sách; **hãy đọc mã nguồn thật trước khi bắt
chước thuật toán của chúng** và ghi nguồn định dạng trong comment (xem CLAUDE.md).

Nguyên tắc nền, không thay đổi:

- 100% client-side, không upload, không lưu key (xem `LEGAL.md`).
- Không dependency, không bước build, tất cả chạy khi mở `index.html`.
- Analytics không bao giờ chứa dữ liệu file.
- Khác biệt của MakerLens so với đa số tool cùng lĩnh vực (CLI/desktop):
  chạy trong trình duyệt, không cài đặt. Mọi mục dưới đây phải giữ được điều đó.

Ký hiệu công sức: **S** (≤ 1 ngày), **M** (vài ngày), **L** (hơn một tuần).

---

## 1. Nên làm (ưu tiên cao)

Tác động lớn, công sức nhỏ, nằm trong phạm vi hiện tại.

| # | Việc | Vì sao | Công sức |
|---|------|--------|----------|
| 1 | **Suy key từ header PNG đã biết** khi `System.json` thiếu, hỏng hoặc bị sửa | Header ảnh `.rpgmvp`/`.png_` sau 16 byte đầu là 16 byte PNG đã biết (signature + chunk IHDR), nên XOR ngược ra key. Hiện app thất bại nếu thiếu `System.json`. Key vẫn chỉ nằm trong bộ nhớ | S |
| 2 | **Mở file lẻ** (kéo thả vài `.rpgmvp`/`.png_`/`.rpgmvo`...) | Cần có mục 1 để dùng được khi không có `System.json`. Với âm thanh có thể thử key đã suy từ ảnh, hoặc từ header OggS đã biết | S–M |
| 3 | **Báo lỗi theo từng file, không dừng cả lần mở** (archive hỏng, file cắt cụt, header sai) | Hiện lỗi dễ làm hỏng cả luồng. Nên liệt kê phần đọc được, đánh dấu file lỗi và lý do | S–M |
| 4 | **Test thêm cho đầu vào xấu**: header RGSSAD sai, offset/size vượt file, tên file có `..` hoặc ký tự lạ, vòng lặp dài | Tăng độ tin cậy, đồng thời chặn path traversal khi xuất ZIP. Fixture vẫn dựng trong test, không dùng asset thật | S |
| 5 | **Kiểm tra tên file khi xuất ZIP** (loại `..`, đường dẫn tuyệt đối, ký tự cấm trên Windows, tên trùng sau khi đổi đuôi) | Archive đầu vào là dữ liệu không tin cậy; tên entry đi thẳng vào ZIP | S |

## 2. Nên làm (tiếp theo)

Tính năng người dùng RPG Maker thực sự dùng, bám vào quy ước sẵn có của engine.

| # | Việc | Ghi chú | Công sức |
|---|------|---------|----------|
| 6 | **Cắt sprite theo lưới + phát hoạt ảnh đi bộ** cho charset | Quy ước tên: tiền tố `$` là một nhân vật (3×4 khung), không có `$` là sheet 8 nhân vật (12×8); `!` là object không dịch nửa ô. Ô 48×48 (MV/MZ) hoặc 32×32 (VX/VX Ace, tùy chỉnh) | M |
| 7 | **Hiển thị loop point của audio** (`LOOPSTART`, `LOOPLENGTH` trong Vorbis comment của OGG) và phát lặp đúng điểm | RPG Maker MV/MZ dùng các tag này. Chỉ cần đọc comment packet của OGG, không cần decoder riêng | M |
| 8 | **Gom file trùng nội dung** (băm SHA-256 bằng `crypto.subtle`) và bộ lọc "chỉ hiện bản duy nhất" | Hữu ích với game nhân bản asset. Băm sau khi giải mã, chạy nền, không ảnh hưởng ưu tiên đọc của người dùng (`Fg.active`) | M |
| 9 | **Tài liệu hóa định dạng bằng Kaitai Struct (`.ksy`)** cho `.rpgmvp` và RGSSAD v1/v3 trong `docs/formats/` | Không thêm dependency vào app. Giúp người khác kiểm chứng và tái dùng; khớp yêu cầu ghi nguồn định dạng | S–M |
| 10 | **Tìm kiếm tốt hơn**: lọc theo loại, theo kích thước ảnh, theo độ dài audio | Dữ liệu đã có trong thumbnail và audio metadata | S–M |

## 3. Có thể làm (cân nhắc, tùy nhu cầu người dùng)

Hợp lý nhưng cần xác nhận có người dùng thật, hoặc mở rộng phạm vi đáng kể.

| # | Việc | Ghi chú | Công sức |
|---|------|---------|----------|
| 11 | **RPG Maker 2000/2003**: mở thư mục game trần, xem PNG/WAV/MIDI, giải mã ảnh `.xyz` | `.xyz` là chuỗi zlib kèm palette; trình duyệt có `DecompressionStream('deflate')` nên không cần thư viện. Tham khảo mô tả trong `libxyzimage`/`xyz2png`. Định dạng nhỏ, rủi ro thấp | M |
| 12 | **Xem tileset (A1–A5, B–E) ghép sẵn** và phân biệt autotile | Cần hiểu bố cục từng loại; chỉ hiển thị, không cần dựng map | M |
| 13 | **Ren'Py `.rpa`** (RPA-2.0/3.0) | Index là pickle nén zlib; phải tự viết bộ đọc pickle tối thiểu và an toàn (không chạy gì cả). Mở sang cộng đồng visual novel, nhưng lệch thương hiệu "RPG Maker" | L |
| 14 | **Wolf RPG archive** | `rpga` hỗ trợ giải nén; nhiều phiên bản mã hóa khác nhau. Chỉ làm nếu có yêu cầu rõ ràng và có tài liệu định dạng đáng tin | L |
| 15 | **Phát hiện và thông báo rõ khi game dùng mã hóa tùy chỉnh** (plugin giải mã, header đổi) | Chỉ báo "không hỗ trợ vì ..." thay vì thất bại âm thầm. Không cố bẻ plugin | S–M |
| 16 | **PWA / chạy offline** (service worker) | Hợp với lời hứa riêng tư, nhưng cần cập nhật CSP và bước "Assemble site" của deploy | M |
| 17 | **Liên kết chéo với LoreInsight** (xem luồng sự kiện ↔ xem asset) | Chỉ là liên kết/hướng dẫn, không chia sẻ dữ liệu giữa hai trang | S |
| 18 | **Nén ZIP (deflate)** bằng `CompressionStream` thay vì chỉ "store" | Tải về nhỏ hơn; cần tự tính CRC cho dữ liệu nén như hiện tại. Lợi ích hạn chế vì PNG/OGG vốn đã nén | S–M |

## 4. Không nên làm

Đi ngược nguyên tắc nền của dự án hoặc rủi ro pháp lý, hoặc lợi ích không đáng.

| Việc | Lý do |
|------|-------|
| **Bất kỳ upload/đồng bộ phía server** (kể cả "chia sẻ link", lưu thư viện lên cloud, OCR/dịch thuật gọi API với nội dung file) | Vi phạm ràng buộc DMCA trong `LEGAL.md` và lời hứa riêng tư |
| **Đóng gói hoặc nhúng asset game thật** (ảnh mẫu, audio demo, fixture từ game thật) | Cùng lý do pháp lý; test luôn dùng byte tổng hợp |
| **Lưu key giải mã hoặc tên game/thư mục** vào localStorage, cookie, analytics | Key chỉ trong bộ nhớ; analytics không được biết người dùng mở gì. Cũng tránh phải có banner đồng ý |
| **Thêm analytics chi tiết** (số file, loại engine, kích thước game, lỗi kèm tên file) | Dù ẩn danh, chúng làm yếu lập luận pháp lý. Nếu cần chẩn đoán lỗi, hiển thị tại máy người dùng và để họ tự sao chép |
| **Tải hoặc gọi host bên thứ ba** (CDN, font, thư viện) | CSP chỉ cho phép endpoint GoatCounter; giữ không dependency |
| **Thêm bước build, bundler, framework, package manager** | Mất lợi thế "mở `index.html` là chạy" và dễ kiểm chứng mã |
| **Tính năng sửa/đóng gói lại game** (re-encrypt, tạo lại project, vá game, bypass bảo vệ bản quyền) | Rời khỏi vai trò "xem và trích xuất", tăng rủi ro pháp lý; tool khác đã làm tốt hơn (RPG Maker Decrypter, Petschko) |
| **Bẻ DRM/mã hóa của plugin hoặc công cụ bảo vệ bên thứ ba** | Ngoài phạm vi định dạng chuẩn của engine; rủi ro pháp lý |
| **Chuyển đổi/dịch văn bản game, trình soạn map, trình sửa save, mô phỏng engine** | Là sản phẩm khác (rpgmtranslate, Luminol, EasyRPG, mkxp...). Không đáng trùng lặp công sức |
| **Viết lại bằng WebAssembly/Rust chỉ để nhanh hơn** | Giải mã chỉ XOR 16 byte; nút thắt nằm ở I/O đĩa và giải mã ảnh, không phải CPU |
| **Mở rộng sang hàng chục engine/format kiểu QuickBMS/GARbro/AssetStudio** | Các tool đó chuyên hóa và đã trưởng thành; MakerLens thắng ở độ tập trung và dễ dùng |

---

## Thứ tự đề xuất

1. Mục 1 → 5 (độ bền: suy key, file lẻ, lỗi theo file, test đầu vào xấu, làm sạch tên ZIP).
2. Mục 6 và 7 (sprite và loop point: điểm khác biệt dễ thấy nhất).
3. Mục 9 (tài liệu `.ksy`) làm song song, độc lập với code.
4. Mục 11 (RPG Maker 2000/2003) nếu có người dùng yêu cầu.
5. Các mục còn lại đánh giá lại sau mỗi đợt phát hành.

## Cách chọn việc mới

Một việc đáng làm khi: (a) giữ được 100% client-side và không dependency,
(b) không cần gửi bất cứ thứ gì về server, (c) có tài liệu hoặc triển khai tham
chiếu để ghi nguồn, (d) kiểm thử được bằng byte tổng hợp. Thiếu một trong bốn
điều kiện thì chuyển xuống mục 4 hoặc cần thảo luận trước.

---

## Tài liệu tham khảo và ghi nhận (acknowledgements)

Danh sách gốc: [awesome-game-file-format-reversing](https://github.com/VelocityRa/awesome-game-file-format-reversing)
([bản web](https://velocityra.github.io/awesome-game-file-format-reversing/)).
Các dự án dưới đây được **nhận diện từ mô tả trong danh sách**; khi dùng logic
của chúng, đọc mã nguồn thật, kiểm tra giấy phép, viết lại theo cách riêng và
ghi nguồn trong comment mã (CLAUDE.md: "document the format source").
Cột "Dùng cho" trỏ về số mục ở trên.

### RPG Maker MV/MZ (`.rpgmvp`, `.png_`, `.rpgmvo`, `.ogg_`...)

| Dự án | Dùng cho |
|-------|----------|
| [uuksu/RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter) (MIT; bản sao cục bộ ở `references/`) | Nguồn chính của thuật toán RGSSAD và MV/MZ |
| [RPG-Maker-Translation-Tools/rpgm-asset-decrypter-rs](https://github.com/RPG-Maker-Translation-Tools/rpgm-asset-decrypter-rs) và [rpgm-asset-decrypter-lib](https://github.com/RPG-Maker-Translation-Tools/rpgm-asset-decrypter-lib) | Mục 1–2: suy key khi thiếu `System.json` |
| [Petschko/RPG-Maker-MV-Decrypter](https://gitlab.com/Petschko/RPG-Maker-MV-Decrypter) | Mục 1–2, 15: xử lý key và header (kèm [bản GitHub cũ, chỉ đọc](https://github.com/Petschko/RPG-Maker-MV-Decrypter)) |
| [Bioruebe/rmvdec](https://github.com/Bioruebe/rmvdec) | Mục 2: giải mã file lẻ |
| [RPG-Maker-Translation-Tools/rpgmdec](https://github.com/RPG-Maker-Translation-Tools/rpgmdec) | Mục 3: kiểm tra asset sau giải mã |
| [TTitanUA/rpg-game-decrypter-python](https://github.com/TTitanUA/rpg-game-decrypter-python) | Tham khảo luồng giải mã MV/MZ trong GUI |

### RPG Maker XP / VX / VX Ace (RGSSAD)

| Dự án | Dùng cho |
|-------|----------|
| [luxrck/rgssad](https://github.com/luxrck/rgssad) | Đối chiếu v1/v3 |
| [usagirei/RGSS-Decryptor](https://github.com/usagirei/RGSS-Decryptor) ([bản của Bioruebe](https://github.com/Bioruebe/RGSS-Decryptor)) | Đối chiếu v1/v3 |
| [RPG-Maker-Translation-Tools/rpgm-archive-decrypter](https://github.com/RPG-Maker-Translation-Tools/rpgm-archive-decrypter) và [rpgm-archive-decrypter-lib](https://github.com/RPG-Maker-Translation-Tools/rpgm-archive-decrypter-lib) | Mục 3–4: xử lý archive hỏng |
| [elizagamedev/rpga](https://github.com/elizagamedev/rpga) | Mục 14: Wolf RPG archive |
| [dogtopus/rgssad-fuse](https://github.com/dogtopus/rgssad-fuse) | Đọc lazy từng entry, tránh nạp cả archive |
| [Ancurio/mkxp](https://github.com/Ancurio/mkxp) ([mkxp-z](https://github.com/mkxp-z/mkxp-z)) | Hành vi RGSS khi đọc archive |

### RPG Maker 2000/2003 và các bản cũ

| Dự án | Dùng cho |
|-------|----------|
| [Ghabry/libxyzimage](https://github.com/Ghabry/libxyzimage) | Mục 11: ảnh `.xyz` |
| [vn-tools/xyz2png](https://github.com/vn-tools/xyz2png) (gộp vào [arc_unpacker](https://github.com/vn-tools/arc_unpacker)) | Mục 11: ảnh `.xyz` |
| [EasyRPG/liblcf](https://github.com/EasyRPG/liblcf), [EasyRPG/Player](https://github.com/EasyRPG/Player), [EasyRPG/Tools](https://github.com/EasyRPG/Tools) | Mục 11–12: định dạng LCF, kết xuất bản đồ |
| [Ghabry/rpg95-fileformat](https://github.com/Ghabry/rpg95-fileformat) | Tài liệu định dạng RPG Maker 95 |
| [florianessl/lucifer-file-carver](https://github.com/florianessl/lucifer-file-carver) | Mục 3: chịu lỗi khi dữ liệu hỏng |

### Audio, sprite, nhận diện

| Dự án | Dùng cho |
|-------|----------|
| [Splendide-Imaginarius/crosslooper](https://github.com/Splendide-Imaginarius/crosslooper) | Mục 7: quy ước `LOOPSTART`/`LOOPLENGTH` |
| [MeguminBOT/TextureAtlas-Toolbox](https://github.com/MeguminBOT/TextureAtlas-Toolbox) | Mục 6: cắt sprite sheet |
| [BoBoBaSs84/DDS.Tools](https://github.com/BoBoBaSs84/DDS.Tools) | Mục 8: phát hiện trùng |

### Tài liệu định dạng và công cụ phân tích

| Dự án | Dùng cho |
|-------|----------|
| [Kaitai Struct](https://kaitai.io/) ([mã nguồn](https://github.com/kaitai-io/kaitai_struct)) | Mục 9: mô tả `.ksy` |
| [pytai](https://github.com/Dvd848/pytai) | Kiểm tra cấu trúc `.ksy` trên dữ liệu mẫu |
| [palimpsest](https://github.com/kenrinzero/palimpsest) | Danh mục header container, tham khảo nhận diện định dạng |

### Mô hình sản phẩm (trình xem chạy trong trình duyệt)

| Dự án | Ý tưởng |
|-------|---------|
| [magcius/noclip.website](https://github.com/magcius/noclip.website) | Trình xem game chạy hoàn toàn trong trình duyệt |
| [Kokoroou/lore-insight](https://github.com/Kokoroou/lore-insight) | Mục 17: công cụ cùng tác giả, cùng nguyên tắc offline |
| [steffest/DPaint-js](https://github.com/steffest/DPaint-js) | Ví dụ định dạng cũ đọc thuần JavaScript |
| [InvoxiPlayGames/stfs-webjs](https://github.com/InvoxiPlayGames/stfs-webjs) | Ví dụ đọc container nhị phân trong trình duyệt |

### Ngoài phạm vi (chỉ để biết, xem mục 4)

[Luminol](https://github.com/Astrabit-ST/Luminol),
[rpgmtranslate-qt](https://github.com/RPG-Maker-Translation-Tools/rpgmtranslate-qt),
[rvpacker-txt-rs](https://github.com/RPG-Maker-Translation-Tools/rvpacker-txt-rs),
[rpgsave-converter](https://github.com/13xforever/rpgsave-converter).
