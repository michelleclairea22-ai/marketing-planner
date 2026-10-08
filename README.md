# Content Planner

Kalendar peribadi Michelle Claire. Untuk tugasan, acara, nota, dan peringatan posting. Bukan Google Calendar. Bukan papan analitik.

Data disimpan dalam Google Sheet. Telefon dan laptop baca sheet yang sama.

Kalau Google belum disambung, app tetap jalan dalam **mod demo**. Kalendar mula kosong, tanpa item contoh. Item yang anda tambah kekal di telefon atau laptop itu sahaja.

Zon masa: Asia/Kuala_Lumpur (UTC+8).

## Cuba dulu, tanpa Google

1. Muat turun projek ini (Code > Download ZIP) dan unzip.
2. Dalam folder projek (tempat `index.html` berada), buka terminal dan taip:

```bash
python3 -m http.server 4177
```

3. Buka pelayar: `http://127.0.0.1:4177`
4. Jangan buka fail `index.html` terus (double click). Modul dan ikon tak jalan macam itu.

## Fail dalam projek

| Tempat | Isi |
| --- | --- |
| root repo | Laman app: `index.html`, `css/`, `js/`, `icons/`, `manifest.json`, `sw.js`, `.nojekyll`. |
| `apps-script/Code.gs` | Kod untuk Google Sheet. |
| `apps-script/appsscript.json` | Zon masa dan kebenaran. |
| `scripts/make-icons.py` | Jana ikon semula dari logo (tak wajib). |

## A. Buat Google Sheet

1. Buka [Google Sheet](https://sheets.google.com) dengan akaun Gmail anda.
2. Sheet kosong. Namakan **Content Planner**.
3. Biarkan kosong. Jangan taip di baris 1. `setup` akan buat kepala jadual.

## B. Tampal kod

1. Dalam sheet: **Extensions > Apps Script**.
2. Fail `Code.gs` terbuka. Padam semua. Buka `apps-script/Code.gs` dalam projek ini, pilih semua, salin, tampal.
3. Klik ikon gear **Project Settings**.
4. Tandakan **Show "appsscript.json" manifest file in editor**.
5. Buka `appsscript.json`. Padam semua. Tampal kandungan `apps-script/appsscript.json`.
6. Klik **Save** (ikon disket).

Zon masa dalam fail itu ialah `Asia/Kuala_Lumpur`. Jangan tukar.

## C. Kunci dan pautan

1. Masih di Project Settings, cari **Script properties**.
2. Klik **Add script property**. Nama dan nilai mesti tepat.

| Property | Value |
| --- | --- |
| `ACCESS_KEY` | Kunci rahsia anda. Contoh: `kucing-biru-KK-2026-48`. Jangan guna nama anda sahaja. |
| `APP_URL` | Pautan laman nanti. Contoh: `https://namaanda.github.io/marketing-planner/` |

3. Klik **Save script properties**.

`ACCESS_KEY` dan `APP_URL` huruf besar semua. Kalau silap huruf, app tak boleh masuk.

Anda boleh isi `APP_URL` selepas GitHub Pages siap. Emel baca nilai ini semasa dihantar, jadi boleh dikemas kemudian tanpa pasang semula peringatan.

Jangan kongsi kunci. Sesiapa yang ada pautan Web App **dan** kunci boleh nampak item anda.

## D. Setup helaian

1. Dalam editor Apps Script, pilih fungsi **setup** (kotak di atas).
2. Klik **Run**.
3. Google minta kebenaran. Kalau tulis "Google hasn't verified this app":
   - Klik **Advanced** (Lanjutan).
   - Klik **Go to Content Planner (unsafe)**.
   - Ini skrip anda sendiri, bukan app orang lain.
4. Klik **Allow**.

Kebenaran yang diminta:

- Lihat dan edit sheet ini — supaya item boleh disimpan.
- Hantar emel sebagai anda — supaya peringatan sampai ke Gmail anda.
- Urus pemasa (trigger) — supaya emel pagi dan peringatan 15 minit boleh berjalan.

Selepas siap, tutup dan buka semula Google Sheet. Tab **Items** ada, dengan kepala jadual. Menu **Content Planner** juga muncul di atas.

Kalau menu belum ada, jalankan `setup` dari editor sekali lagi.

## E. Deploy Web App

1. Klik **Deploy > New deployment**.
2. Klik gear di sebelah **Select type**. Pilih **Web app**.
3. Isi:
   - Description: `Content Planner`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**. Benarkan kebenaran jika diminta.
5. Salin **Web app URL**. Mesti berakhir dengan `/exec`, bukan `/dev`.

**Anyone** bermaksud telefon boleh hubungi skrip tanpa login Google. Data tetap dikunci dengan `ACCESS_KEY`.

Setiap kali anda ubah `Code.gs` kemudian: **Deploy > Manage deployments > Edit (pensel) > Version: New version > Deploy**. Pautan `/exec` kekal sama.

## F. Pasang emel peringatan

1. Dalam editor, pilih fungsi **installTriggers**.
2. Klik **Run**. Benarkan jika diminta.
3. Dalam log (Execution log) patut ada emel anda.

Ini pasang dua pemasa:

- Setiap hari, sekitar **jam 8 pagi** (boleh lewat dalam jam 8–9, Google tak tepat seminit). Emel ringkas: item hari ini dan item terlewat yang masih Belum.
- Setiap **15 minit**. Kalau ada item bermasa, `remind` hidup, status Belum, dan belum diingatkan, emel dihantar **16 hingga 30 minit sebelum** masa itu. Lepas hantar, `remindedAt` diisi supaya tak hantar dua kali.

Emel pergi ke akaun Google yang menjalankan `installTriggers`. Subjek bermula dengan **Content Planner**.

Cuba tanpa tunggu pagi:

1. Pilih **previewDailyDigest**, Run. Teks emel keluar dalam log. Tak hantar emel.
2. Pilih **sendDailyDigest**, Run. Emel benar dihantar jika ada item hari ini atau item terlewat.
3. Untuk peringatan 30 minit: dalam app, buat item Belum, isi masa lebih kurang 20 minit dari sekarang, hidupkan Ingatkan. Kemudian Run **sendUpcomingReminders**. Atau tunggu pemasa 15 minit.

Kalau tak ada item untuk diingatkan, tak ada emel. Itu sengaja, supaya peti masuk tak penuh.

## G. Letak laman di GitHub Pages

Laman ini fail statik. Tiada `npm install`. Fail laman sudah di root repo (`index.html`, `manifest.json`, `sw.js`, `.nojekyll`, folder `css`, `js`, `icons`). Jangan masukkan folder `web`.

1. Pergi **Settings > Pages** pada repo `marketing-planner`.
2. Branch: **main**. Folder: **/ (root)**. Klik **Save**.
3. Tunggu satu atau dua minit.
4. Buka `https://michelleclairea22-ai.github.io/marketing-planner/`

Kemaskini `APP_URL` dalam Script properties kepada pautan ini, jika belum.

## H. Sambung app ke Sheet

1. Buka pautan GitHub Pages.
2. Pergi **Tetapan**.
3. Tampal Web App URL (`.../exec`) dan kunci `ACCESS_KEY`.
4. Klik **Uji & simpan**.
5. Tunggu. Google kadang ambil beberapa saat. Bila berjaya, status jadi **Disegerak**.

Buat benda yang sama pada telefon dan laptop. Kunci dan URL yang sama. Item, status Siap, dan notifikasi dibaca (`readAt`) akan sama di kedua-dua.

Item yang anda buat sendiri dalam mod demo akan naik ke Sheet semasa sambungan pertama, jika ia lebih baru daripada baris dalam Sheet. Item contoh lama tidak dihantar ke Sheet.

## I. Tambah ke skrin utama telefon

**iPhone (Safari)**

1. Buka pautan app.
2. Tekan butang Kongsi (kotak dengan anak panah).
3. **Tambah ke Skrin Utama**.
4. Nama: Content Planner. Tekan **Tambah**.

**Android (Chrome)**

1. Buka pautan app.
2. Menu tiga titik.
3. **Tambah ke skrin utama** atau **Install app**.
4. Pasang.

Ikon ialah logo kalendar dengan pin.

## Cara guna

- **Bulan / Minggu / Senarai** — tukar paparan. Anak panah tukar bulan atau minggu. **Hari ini** kembali ke tarikh semasa.
- **+ Tambah** — item baru. Jenis: Tugasan, Acara, Nota, Posting. Jenama: Brutti, Selesaai, Tumbooh, Badax, Saja, Umum.
- Warna titik ikut jenama. Umum berwarna kelabu.
- Dalam senarai dan panel kanan, tekan **Belum** atau **Siap** sekali untuk tukar status.
- Cari tajuk. Tapis jenama, jenis, dan status.
- Pada laptop: menu kiri, kalendar di tengah, **Senarai hari ini** di kanan.
- Pada telefon: menu bawah. Tekan satu hari dalam bulan untuk lihat senarai hari itu.
- Loceng — pusat notifikasi. Kira item terlewat yang masih Belum, item hari ini yang Belum, dan item bermasa dalam 7 hari. Item Siap tak masuk.
- **Tandakan dibaca** dan **Tandakan semua dibaca** disimpan dalam Sheet (`readAt`), jadi telefon dan laptop setuju.
- **Tandakan siap** dari notifikasi keluarkan item dari kerja tertunggak.
- Tekan satu notifikasi untuk buka item itu terus.
- **Tetapan > Kosongkan data** — buang item pada peranti ini. Kalau Sheet sudah bersambung, hanya cache tempatan dikosongkan. Baris dalam Sheet tidak dipadam.

## Kalau ada masalah

| Apa yang berlaku | Cuba ini |
| --- | --- |
| "Kunci salah" | Semak `ACCESS_KEY` dalam Script properties. Huruf besar tepat. Kunci dalam app mesti sama. |
| "Tab Items tiada" | Jalankan `setup` sekali lagi. |
| "Tak dapat hubung" | URL mesti `/exec`. Deploy semula jika anda ubah kod. Internet hidup. |
| Laman GitHub kosong atau 404 | `index.html` mesti di root repo, bukan dalam folder `web`. Tunggu Pages siap. |
| Emel tak sampai | Jalankan `installTriggers` semasa log masuk. Semak spam. Digest kosong tak dihantar. |
| Ubah kod tapi app lama | Deploy versi baru (Manage deployments > New version). Pada telefon, tutup app dan buka semula. |
| Buka `index.html` dari folder | Guna pautan GitHub atau `python3 -m http.server`. |

## Perkara yang app ini tak buat

- Bukan Google Calendar, dan tak segerak dengan kalendar Google.
- Tak ada analitik, kempen, atau banyak pengguna.
- Tak ada ulang setiap minggu. Satu baris, satu item. Salin secara manual jika perlu.
- Emel hanya ke pemilik skrip, bukan ke pelanggan.
- Digest tiba dalam lingkungan jam 8–9 pagi, bukan tepat saat 8:00:00.
- Peringatan tiba 16–30 minit sebelum masa, kerana semakan setiap 15 minit.
- Laman GitHub Pages adalah awam. Data item tidak awam, selagi kunci tidak dikongsi.
- Selepas ubah `Code.gs`, anda mesti deploy versi baru. Simpan sahaja tidak cukup.
