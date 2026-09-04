# @we-grid/angular

[English](README.md)

Hiçbir tema/CSS framework bağımlılığı olmayan (Bootstrap/Material gerekmez), Angular CDK üzerine
kurulu standalone component/direktiflerden oluşan, temalanabilir bir Angular veri grid'i.

<!-- ekran görüntüsü yer tutucusu -->

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
- Salt CSS custom property (`--we-grid-*`) ile temalama, hazır açık/koyu tema

## Kurulum

```bash
npm install @we-grid/angular @angular/cdk
```

> **Not:** `@we-grid/angular` yeni bir paket adı — yayınlamadan önce npm'de müsaitliğini
> (`npm view @we-grid/angular`) kontrol edin veya sahip olduğunuz bir scope/isimle değiştirin.

Peer bağımlılıklar: `@angular/core`, `@angular/common`, `@angular/forms`, `@angular/cdk` (Angular 18.x).

Başlık/filtre context menülerinin kullandığı CDK overlay stilini ve isteğe bağlı hazır varsayılan
temayı uygulamanızın global stillerine ekleyin:

```json
// angular.json
"styles": [
  "node_modules/@angular/cdk/overlay-prebuilt.css",
  "node_modules/@we-grid/angular/styles/we-grid-theme.scss",
  "src/styles.scss"
]
```

## Hızlı başlangıç

```ts
import { Component } from '@angular/core';
import { WeGridComponent, WeGridColumnDef } from '@we-grid/angular';

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

## Dokümantasyon

İngilizce dokümanlar birincil kaynaktır:

- [Başlarken](docs/getting-started.md)
- [API referansı](docs/api.md)
- [Sunucu taraflı sayfalama/sıralama/filtreleme](docs/server-side.md)
- [Temalama](docs/theming.md)
- [Yerelleştirme](docs/localization.md)
- [React desteği (yoktur)](docs/react.md)

## Geliştirme

Bu depo, kütüphanenin `projects/we-grid` altında, demo uygulamanın `projects/playground` altında
olduğu bir Angular CLI workspace'idir.

```bash
npm install
npx ng build we-grid              # kütüphaneyi derle (dist/we-grid)
npx ng test we-grid --watch=false --browsers=ChromeHeadless
npx ng serve playground           # demo uygulamayı çalıştır
```

## Lisans

MIT — bkz. [LICENSE](LICENSE).
