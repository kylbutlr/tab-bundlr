# App Stylr exceptions

Tab Bundlr follows App Stylr v1.4.1 source for its standalone options and popup surfaces: dark semantic colors, Geist Sans and Geist Mono, mint primary actions, restrained borders, and compact density.

The popup is intentionally narrower than a regular app surface because Chrome constrains action popups. The extension does not inject panels or content scripts into web pages, so no host-native typography exception is required.

The v1.4.1 refresh preserves the product layout and uses a neutral Graphite icon background with the existing light glyph. Popup/editor density is a product composition; it does not change shared semantic roles. The generated-source check covers the committed adapter, bundled fonts and bitmap icons.

Native popups use 40px primary controls and 32px inline workspace actions to preserve room within Chrome’s 600px popup limit. Settings retain 44px fields and primary actions. Chrome workspace colors identify user data and remain distinct from shared feedback colors.

Extension icon delivery retains the scalable 1024-unit SVG master and directly rendered 16, 32, 48, 128 and 512px PNGs. The 512px extension file is the pinned generator’s identical web/icon-512.png output. The top-level manifest declares 16, 32, 128 and 512 so Chrome’s management-page 48px lookup selects the larger 128px resource. The toolbar action separately retains 16, 32, 48 and 128px. Check small-size legibility and large/Retina sharpness independently; never enlarge a small PNG to create a larger export.
