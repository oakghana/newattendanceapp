# Responsive Design Quick Reference Guide

## Tailwind Responsive Breakpoints

```
base    320px-639px  (mobile first - default styles)
sm      640px+       (tablets and up)
md      768px+       (larger tablets)
lg      1024px+      (desktops)
xl      1280px+      (large desktops)
2xl     1536px+      (extra large)
```

---

## Common Responsive Patterns

### Responsive Text Sizing
```tailwind
text-sm sm:text-base md:text-lg lg:text-xl
```

### Responsive Padding
```tailwind
px-3 sm:px-4 md:px-6 lg:px-8
py-2 sm:py-3 md:py-4 lg:py-6
```

### Responsive Grid (1 → 2 → 3 columns)
```tailwind
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
```

### Responsive Flex Direction
```tailwind
flex flex-col sm:flex-row
```

### Responsive Spacing
```tailwind
gap-3 sm:gap-4 md:gap-6 lg:gap-8
mb-4 sm:mb-6 md:mb-8
```

### Responsive Display
```tailwind
hidden sm:block        (show on tablet+)
block sm:hidden        (hide on tablet+)
hidden md:table-cell   (show on desktop as table)
```

---

## Touch Target Guidelines

### Minimum Sizes
```tailwind
min-h-[44px] min-w-[44px]  /* WCAG AA compliant */
```

### Applied to All Interactive Elements
- Buttons: `h-10 sm:h-11 md:h-12` (40px → 48px → 48px)
- Links: `min-h-[44px]`
- Checkboxes: `min-h-[44px] min-w-[44px]`
- Radio buttons: `min-h-[44px] min-w-[44px]`
- Form inputs: `h-10 sm:h-11` (40px → 44px)

---

## Mobile-Specific Utilities

### Safe Area Support
```css
padding-left: max(0px, env(safe-area-inset-left));
padding-right: max(0px, env(safe-area-inset-right));
padding-bottom: max(1.75rem, env(safe-area-inset-bottom));
```

### Responsive Viewport
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
```

### iOS Zoom Prevention
```css
font-size: 16px; /* Prevents zoom on input focus */
```

---

## Animation Optimizations

### Mobile Animations (Faster)
```css
animation: fadeIn 0.3s ease-in-out;    /* 300ms */
animation: slideUp 0.25s ease-out;     /* 250ms */
animation: scaleIn 0.2s ease-out;      /* 200ms */
```

### Desktop Animations (Smoother)
```css
animation: fadeIn 0.5s ease-in-out;    /* 500ms */
animation: slideUp 0.4s ease-out;      /* 400ms */
animation: scaleIn 0.3s ease-out;      /* 300ms */
```

### Touch Feedback
```tailwind
active:scale-95 sm:active:scale-100
/* Smaller scale on mobile for better finger feedback */
```

### Hover States (Desktop Only)
```tailwind
hover:shadow-md sm:hover:shadow-lg
/* Shadow animation visible only on larger screens */
```

---

## Component Examples

### Responsive Card
```jsx
<Card className="p-3 sm:p-4 md:p-6 lg:p-8">
  <CardHeader className="px-0 pb-3 sm:pb-4">
    <CardTitle className="text-lg sm:text-xl md:text-2xl">
      Title
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-3 sm:space-y-4">
    Content
  </CardContent>
</Card>
```

### Responsive Button
```jsx
<Button className="h-10 sm:h-11 md:h-12 text-sm sm:text-base">
  Action
</Button>
```

### Responsive Form
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <Label className="text-xs sm:text-sm">Label</Label>
    <Input className="h-10 sm:h-11" />
  </div>
  <div>
    <Label className="text-xs sm:text-sm">Label</Label>
    <Input className="h-10 sm:h-11" />
  </div>
</div>
```

### Responsive Grid Layout
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {items.map(item => (
    <Card key={item.id}>{item.name}</Card>
  ))}
</div>
```

---

## Typography Guidelines

### Responsive Font Sizes
```
Mobile          Tablet/Desktop    Usage
text-xs (12px)  sm:text-xs        Labels, hints
text-sm (14px)  sm:text-sm        Body text
text-base (16px) sm:text-base     Input text
text-lg (18px)  sm:text-lg        Subheadings
text-xl (20px)  sm:text-2xl       Headings
text-2xl (24px) sm:text-3xl       Large headings
```

### Line Heights
```tailwind
leading-relaxed   /* 1.625 - Better for mobile */
leading-snug      /* 1.375 - Tighter spacing */
leading-normal    /* 1.5 - Default */
```

---

## Spacing Rules

### Margins & Padding
```tailwind
/* Mobile first approach */
p-3 sm:p-4 md:p-6 lg:p-8
m-2 sm:m-3 md:m-4 lg:m-6

/* Use gaps for spacing between items */
gap-3 sm:gap-4 md:gap-6 lg:gap-8
```

### No Direct Values
❌ Avoid: `p-[16px]`, `m-[8px]`  
✅ Use: `p-4`, `m-2`

### Consistent Scales
- Mobile: `p-2, p-3, p-4`
- Tablet: `sm:p-4, sm:p-5, sm:p-6`
- Desktop: `md:p-6, md:p-7, md:p-8`

---

## Mobile-Only Classes

### Hide on Mobile, Show on Tablet+
```tailwind
hidden sm:block
hidden sm:table-cell
hidden sm:flex
```

### Show on Mobile, Hide on Tablet+
```tailwind
block sm:hidden
flex sm:hidden
```

### Mobile-Specific Padding
```tailwind
px-3 sm:px-4  /* Reduce on mobile, increase on tablet */
py-2 sm:py-3  /* Responsive vertical spacing */
```

---

## Image Optimization

### Responsive Images
```html
<img 
  src="/image.webp" 
  alt="Description"
  className="w-full h-auto"
/>
```

### Responsive Image Sizes
```html
<img 
  srcSet="
    /image-sm.webp 320w,
    /image-md.webp 640w,
    /image-lg.webp 1024w"
  className="w-full"
/>
```

---

## Performance Tips

### For Mobile
- ✅ Use WebP/AVIF formats
- ✅ Lazy load images
- ✅ Minimize animations
- ✅ Reduce motion: `prefers-reduced-motion`
- ✅ Efficient fonts

### For Desktop
- ✅ Use high-quality images
- ✅ Enable hover effects
- ✅ Smooth animations
- ✅ Higher information density
- ✅ Multiple fonts allowed

---

## Common Issues & Solutions

### Issue: Text Zoom on iOS Input Focus
**Solution**: Use `text-base` (16px) minimum
```jsx
<input className="text-base sm:text-lg" />
```

### Issue: Content Hidden Under Bottom Nav
**Solution**: Add padding to main content
```jsx
<main className="pb-24 sm:pb-8">Content</main>
```

### Issue: Buttons Too Small on Mobile
**Solution**: Ensure minimum height
```jsx
<Button className="h-10 sm:h-11">Action</Button>
```

### Issue: Table Overflow on Mobile
**Solution**: Hide columns or use horizontal scroll
```jsx
<div className="overflow-x-auto sm:overflow-visible">
  <Table />
</div>
```

### Issue: Layout Shifts on Different Devices
**Solution**: Use `min-w-0` on flex items
```jsx
<div className="flex min-w-0">
  <div className="flex-1 min-w-0">Content</div>
</div>
```

---

## Testing Checklist

### Before Merging Code
- [ ] Tested on 320px viewport (small phone)
- [ ] Tested on 640px viewport (tablet)
- [ ] Tested on 1024px viewport (desktop)
- [ ] No horizontal scrolling on any size
- [ ] All buttons 44×44px+ on mobile
- [ ] Text readable without zoom
- [ ] Animations smooth on mobile
- [ ] Forms work on mobile keyboard
- [ ] Bottom nav doesn't hide content
- [ ] Images scale properly

### Lighthouse Checklist
- [ ] Mobile Performance > 80
- [ ] Accessibility > 90
- [ ] Best Practices > 90
- [ ] SEO > 90
- [ ] No Core Web Vitals issues

---

## Useful Resources

### Tailwind Docs
- https://tailwindcss.com/docs/responsive-design
- https://tailwindcss.com/docs/breakpoints

### Mobile Design
- https://web.dev/responsive-web-design-basics/
- https://developers.google.com/web/fundamentals/design-and-ux/responsive

### Accessibility
- https://www.w3.org/WAI/WCAG21/quickref/
- https://webaim.org/articles/

### Performance
- https://web.dev/vitals/
- https://pagespeed.web.dev/

---

## Quick Copy-Paste Templates

### Responsive Container
```jsx
<div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
  Content
</div>
```

### Responsive Grid
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id}>{item.name}</Card>)}
</div>
```

### Responsive Form
```jsx
<form className="space-y-4 sm:space-y-5 md:space-y-6">
  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
    <div>
      <Label>Field 1</Label>
      <Input className="h-10 sm:h-11" />
    </div>
    <div>
      <Label>Field 2</Label>
      <Input className="h-10 sm:h-11" />
    </div>
  </div>
  <Button className="w-full h-11">Submit</Button>
</form>
```

### Responsive Card List
```jsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {items.map(item => (
    <Card key={item.id} className="p-4 sm:p-6">
      <h3 className="text-lg sm:text-xl font-semibold">
        {item.title}
      </h3>
      <p className="text-sm sm:text-base text-muted-foreground">
        {item.description}
      </p>
    </Card>
  ))}
</div>
```

---

**Last Updated**: 2026-04-29  
**Version**: 1.0  
**Status**: Ready to Use ✅
