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
| `apps-script/Code.gs` | Kod untuk Google Sheet (item, nota, gambar). |
| `apps-script/Emel.gs` | Peringatan emel 2 hari sebelum (`installEmailTriggers`). |
| `apps-script/appsscript.json` | Zon masa dan kebenaran. |
| `scripts/make-icons.py` | Jana ikon semula dari logo (tak wajib). |

## A. Buat Google Sheet

1. Buka [Google Sheet](https://sheets.google.com) dengan akaun Gmail anda.
2. Sheet kosong. Namakan **Content Planner**.
3. Biarkan kosong. Jangan taip di baris 1. `setup` akan buat kepala jadual.

## B. Tampal kod

1. Dalam sheet: **Extensions > Apps Script**.
2. Fail `Code.gs` terbuka. Padam semua. Buka `apps-script/Code.gs` dalam projek ini, pilih semua, salin, tampal.
   Kemudian klik **+ > Script**, namakan `Emel`, dan tampal `apps-script/Emel.gs`.
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

Anda boleh isi `APP_URL` selepas GitHub Pages siap. Emel peringatan baca nilai ini semasa dihantar (pautan **Buka** dalam emel), jadi boleh dikemas kemudian tanpa pasang semula peringatan.

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
- Gmail dan alamat emel anda — supaya emel peringatan boleh dihantar kepada anda.
- Google Drive — supaya gambar dalam **Nota** disimpan dalam folder **Content Planner Notes**.
- Urus pemasa (trigger) — supaya peringatan setiap pagi boleh berjalan.

Selepas siap, tutup dan buka semula Google Sheet. Tab **Items** dan **Notes** ada, dengan kepala jadual. Menu **Content Planner** juga muncul di atas.

Kalau menu belum ada, jalankan `setup` dari editor sekali lagi.

`setup` selamat dijalankan semula. Jika tab **Items** lama tiada lajur `seriesId` dan `repeat` (untuk item berulang), `setup` menambahnya di hujung tanpa mengubah data sedia ada. Web app juga menambah lajur ini sendiri jika belum ada.

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

## F. Pasang peringatan emel

Peringatan dihantar sebagai **emel** ke akaun Google anda, melalui fail `Emel.gs`.

1. Pastikan fail `Emel.gs` ada dalam projek Apps Script (lihat bahagian B).
2. Pilih fungsi **installEmailTriggers**, klik **Run** sekali. Ini padam pemasa lama dan pasang satu pemasa: setiap hari sekitar **jam 9 pagi**, Asia/Kuala_Lumpur.
3. Pilih fungsi **testEmail**, klik **Run**. Anda patut terima emel **Peringatan Content Planner (ujian)**.

Kod notifikasi ntfy lama (`installTriggers`, `sendTwoDayReminders`, `testNtfy`, `NTFY_TOPIC`) telah dibuang. Script property `NTFY_TOPIC` lama, jika ada, boleh dipadam — ia tidak dibaca lagi.

Syarat peringatan: `remind` hidup, status bukan Siap, dan tarikh item tepat **2 hari** dari hari ini (waktu Kuala Lumpur). Masa item tidak wajib. Satu emel sahaja untuk tarikh itu. `remindedAt` menyimpan tarikh yang sudah diingatkan. Emel peringatan dibuang sendiri sehari selepas tarikh item.

Untuk alamat lain, tambah Script property `OWNER_EMAIL`.

Google tak jamin minit tepat. Emel tiba dalam lingkungan jam 9–10 pagi.

Untuk lihat item yang akan diingatkan hari ini tanpa hantar: jalankan **previewTwoDayReminders**. Teks keluar dalam log sahaja.

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
- **Ingatkan saya** — emel 2 hari sebelum tarikh. Masa tidak wajib.
- **Nota** — nota teks dan gambar. Tambah gambar dari kamera atau galeri, tekan **Lukis** untuk tanda atau conteng (pen merah, hijau, biru; Halus/Tebal; Pemadam; Undo). Lukisan disimpan berasingan, jadi gambar asal tak rosak dan tanda boleh dipadam kemudian. **Lukisan kosong** untuk nota tulisan tangan. Gambar disimpan dalam Google Drive (folder **Content Planner Notes**) dan disegerak ke telefon dan laptop.
- **Ulang** dalam borang item — Tidak / Setiap hari / Setiap minggu / Setiap 2 minggu / Setiap bulan, dengan tarikh **Hingga** (wajib, had 100 ulangan). Setiap ulangan disimpan sebagai item biasa dalam Sheet, berkongsi `seriesId`; `repeat` menyimpan peraturan (cth. `weekly|2026-12-31`). Bulanan pada 29–31 haribulan jatuh pada hari akhir bulan yang lebih pendek. Item berulang ada ikon ulang kecil. Bila edit atau padam satu ulangan, app tanya: **ini sahaja** atau **semua akan datang** (tarikh ini dan selepasnya). Status Siap/Belum hanya untuk ulangan itu. Peringatan emel dan loceng berfungsi seperti item biasa.
- Loceng — pusat notifikasi. Kira item terlewat yang masih Belum, item hari ini yang Belum, item bermasa dalam 7 hari, dan item dengan peringatan hidup yang tepat 2 hari lagi (walaupun tanpa masa). Item Siap tak masuk.
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
| Emel peringatan tak sampai | Jalankan `installEmailTriggers` sekali, kemudian `testEmail`. Semak folder Spam. |
| Gambar nota tak naik | Jalankan `setup` sekali lagi dan benarkan kebenaran Google Drive. Kemudian deploy versi baru. |
| Ubah kod tapi app lama | Deploy versi baru (Manage deployments > New version). Pada telefon, tutup app dan buka semula. |
| Buka `index.html` dari folder | Guna pautan GitHub atau `python3 -m http.server`. |

## Perkara yang app ini tak buat

- Bukan Google Calendar, dan tak segerak dengan kalendar Google.
- Tak ada analitik, kempen, atau banyak pengguna.
- Tak ada ulang setiap minggu. Satu baris, satu item. Salin secara manual jika perlu.
- Peringatan ialah emel kepada anda sahaja, 2 hari sebelum tarikh, sekitar jam 9 pagi. Bukan ke pelanggan.
- Google tak jamin minit tepat. Emel tiba dalam lingkungan jam 9–10 pagi, bukan tepat 9:00:00.
- Laman GitHub Pages adalah awam. Data item tidak awam, selagi kunci tidak dikongsi.
- Selepas ubah `Code.gs`, anda mesti deploy versi baru. Simpan sahaja tidak cukup.
