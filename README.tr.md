# we-grid-angular

[![npm version](https://img.shields.io/npm/v/we-grid-angular.svg)](https://www.npmjs.com/package/we-grid-angular)
[![npm downloads](https://img.shields.io/npm/dm/we-grid-angular.svg)](https://www.npmjs.com/package/we-grid-angular)
[![CI](https://github.com/emrecirik/we-grid/actions/workflows/ci.yml/badge.svg)](https://github.com/emrecirik/we-grid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Angular 18-22](https://img.shields.io/badge/Angular-18%20%E2%80%93%2022-dd0031.svg)](https://angular.dev)
[![CSS framework yok](https://img.shields.io/badge/CSS%20framework-yok-success.svg)](docs/theming.md)

[English](README.md)

Hiçbir tema/CSS framework bağımlılığı olmayan (Bootstrap/Material gerekmez), Angular CDK üzerine
kurulu standalone component/direktiflerden oluşan, ücretsiz ve temalanabilir bir Angular veri grid'i.

![we-grid ile yapılmış sipariş operasyon ekranı](docs/images/ecommerce-dashboard.png)

## Özellikler

- Kolon gizle/göster, yeniden adlandır, sürükle-bırak ile sıralama, yeniden boyutlandırma, sabitleme (sol/sağ), içeriğe göre otomatik genişlik
- Yoğunluk modları (rahat / normal / sıkışık)
- Kullanıcı bazlı düzen otomatik olarak kalıcı (varsayılan localStorage, backend store eklenebilir)
- Filtre satırı + kolon bazlı filtre popover'ı, aktif filtre çipleriyle
- Tek seviyeli gruplama, daraltılabilir bölümler ve grup bazlı özetlerle
- Alt toplam (özet) satırı: toplam / ortalama / min / maks / sayım, kolon bazında
- `weGridRowDetail` şablonu ile satır genişletme (master-detail)
- Sunucu taraflı sayfalama, sıralama ve filtreleme (opt-in, event binding'lerinize göre otomatik algılanır)
- Tamamen yerelleştirilebilir arayüz metni (`WE_GRID_LOCALE`) ve değiştirilebilir ikon seti (`WE_GRID_ICONS`, inline SVG — ikon fontuna bağımlılık yok)
- CSV, Excel (`.xlsx`) ve PDF olarak dışa aktarma; CSV/Excel içe aktarma — ek bir runtime bağımlılığı olmadan
- Grid üzerinden satır ekleme/güncelleme/silme; her kayıt işlemi backend yanıtını bekleyen bir `done` callback'i ile
- Salt CSS custom property (`--we-grid-*`) ile temalama, hazır açık/koyu tema

## Kurulum

```bash
npm install we-grid-angular @angular/cdk
```

Peer bağımlılıklar: `@angular/core`, `@angular/common`, `@angular/forms`, `@angular/platform-browser`,
`@angular/cdk` — Angular **18.2 ile 22** arası sürümler destekleniyor.

Başlık/filtre context menülerinin kullandığı CDK overlay stilini ve isteğe bağlı hazır varsayılan
temayı uygulamanızın global stillerine ekleyin:

```json
// angular.json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "node_modules/we-grid-angular/styles/we-grid-theme.scss",
  "src/styles.scss"
]
```

## Hızlı başlangıç

```ts
import { Component } from '@angular/core';
import { WeGridComponent, WeGridColumnDef } from 'we-grid-angular';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
}

@Component({
  standalone: true,
  imports: [WeGridComponent],
  template: `
    <we-grid gridKey="products" [columns]="columns" [data]="products" trackByField="id"></we-grid>
  `
})
export class ProductListComponent {
  columns: WeGridColumnDef<Product>[] = [
    { field: 'code', header: 'Kod', width: 120 },
    { field: 'name', header: 'Ad', width: 220 },
    { field: 'price', header: 'Fiyat', type: 'currency', width: 130, summary: 'sum' }
  ];
  products: Product[] = [/* ... */];
}
```

`gridKey` zorunludur — kullanıcının kolon düzeni bu anahtarla saklanır, her grid örneği için benzersiz olmalıdır.

## Ekran görüntüleri

Aşağıdaki görsellerin tamamı bu depodaki örnek uygulamalardan alınmış gerçek ekranlardır; hepsini
tek sayfada görmek için [ekran galerisine](https://emrecirik.github.io/we-grid/) bakabilirsiniz.

### Kolon menüsü — son kullanıcının değiştirebildiği her şey

Başlığa sağ tıklayın (veya ⚙ düğmesini kullanın): kolon gizleme, yeniden adlandırma, sabitleme,
sıralama, içeriğe göre genişletme, alt toplam fonksiyonu seçme, yoğunluk değiştirme, kolona göre
gruplama ve düzeni sıfırlama. Seçilen her şey kullanıcı ve `gridKey` bazında saklanır.

![Tüm kolon aksiyonlarını içeren başlık menüsü](docs/images/header-menu.png)

### Filtre satırı, filtre çipleri ve canlı toplamlar

Filtre satırı her kolona bir operatör ve değer verir; aktif filtreler kaldırılabilir çiplere dönüşür.
`serverSide` açıkken her değişiklik yalnızca bir event'tir — bu örnekteki KPI kartları ve alt toplam
satırı, görünen sayfayı değil filtrelenmiş kümenin tamamını temel alarak backend'de hesaplanır.

![Aktif şehir filtresi ve güncellenen KPI kartları](docs/images/filter-row.png)

### Gruplama, grup bazlı alt toplamlar ve satır seçimi

![Kategoriye göre gruplanmış ürünler, alt toplamlar ve toplu aksiyon çubuğu](docs/images/retail-market.png)

### Master-detail satırlar ve sabitlenmiş kolonlar

![Masraf kırılımı açılmış banka hareketleri](docs/images/banking.png)

### Koyu tema

Koyu tema, üst bir elemana eklenen tek bir `data-theme="dark"` özniteliğidir — grid input'u yok,
ek bundle yok. Her renk, ezebileceğiniz bir `--we-grid-*` custom property'sidir.

![Aynı ekranın koyu temalı hâli](docs/images/dark-theme.png)

## Örnek uygulamalar

Üçü de bu workspace'te kayıtlı ve Angular CLI ile çalıştırılabilir
([`SampleUsageProjects/`](SampleUsageProjects/README.md)):

| Uygulama | Gösterdiği |
|---|---|
| [`banking`](SampleUsageProjects/banking) | Satır bazında farklı para birimleri, sabitlenmiş kolon, tarih aralığı filtresi, backend'den gelen toplamlar, master-detail satırlar |
| [`retail-market`](SampleUsageProjects/retail-market) | Alt toplamlı gruplama, boolean kolon ve filtresi, `rowClass` ile satır vurgulama, çoklu seçim ve toplu aksiyonlar, yoğunluk değiştirme |
| [`ecommerce-dashboard`](SampleUsageProjects/ecommerce-dashboard) | Sunucu taraflı referans örnek: mock backend'e karşı sayfalama/sıralama/filtreleme, KPI kartları, `displayValue` ile durum rozetleri, özel layout store, XML veri kaynağı, koyu tema anahtarı |

```bash
npm install
npm run build:lib                 # önce kütüphaneyi derleyin
npm run start:ecommerce           # sonra herhangi bir örnek uygulamayı
```

## Dokümantasyon

İngilizce dokümanlar birincil kaynaktır:

- [Başlarken](docs/getting-started.md)
- [API referansı](docs/api.md)
- [Sunucu taraflı sayfalama/sıralama/filtreleme](docs/server-side.md)
- [Dışa/içe aktarma (CSV / Excel / PDF)](docs/export-import.md)
- [Satır içi düzenleme](docs/row-editing.md)
- [Temalama](docs/theming.md)
- [Yerelleştirme](docs/localization.md)
- [React ile kullanılabilir mi?](docs/react.md)

## Geliştirme

Bu depo; kütüphanenin `projects/we-grid`, özellik denemelerinin `projects/playground` ve üç örnek
uygulamanın `SampleUsageProjects/` altında olduğu bir Angular CLI workspace'idir.

```bash
npm install
npm run build:lib     # kütüphaneyi dist/we-grid altına derler
npm test              # 140 birim testi, headless Chrome
npm start             # playground uygulamasını çalıştırır
```

## Katkı

Issue ve pull request'ler memnuniyetle karşılanır — bkz. [CONTRIBUTING.md](CONTRIBUTING.md).

## Lisans

MIT — bkz. [LICENSE](LICENSE). Ticari kullanım dahil serbesttir.
