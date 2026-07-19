// Extract an embedded icon from a PE file (exe/dll) at a given index and encode
// it as a PNG data URL. Handles the common `app.exe,0` DisplayIcon form.

#[cfg(windows)]
pub fn extract_exe_icon_data_url(path: &str, index: i32, size: i32) -> Result<String, String> {
    use base64::Engine;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, GetIconInfo, PrivateExtractIconsW, ICONINFO,
    };

    let wide: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut hicon = std::ptr::null_mut();
    let mut icon_id: u32 = 0;
    let extracted = unsafe {
        PrivateExtractIconsW(wide.as_ptr(), index, size, size, &mut hicon, &mut icon_id, 1, 0)
    };
    if extracted == 0 || extracted == u32::MAX || hicon.is_null() {
        return Err(format!("No extractable icon at index {index} in {path}"));
    }

    // Everything below is fallible; make sure DestroyIcon always runs afterward.
    let result = (|| unsafe {
        let mut info: ICONINFO = std::mem::zeroed();
        if GetIconInfo(hicon, &mut info) == 0 {
            return Err("GetIconInfo failed".to_string());
        }
        let hbm_color = info.hbmColor;
        let hbm_mask = info.hbmMask;

        // Free both bitmaps on the way out of this closure.
        let cleanup = |c: *mut core::ffi::c_void, m: *mut core::ffi::c_void| {
            if !c.is_null() {
                DeleteObject(c);
            }
            if !m.is_null() {
                DeleteObject(m);
            }
        };

        if hbm_color.is_null() {
            cleanup(hbm_color, hbm_mask);
            return Err("Icon has no color bitmap (monochrome not supported)".to_string());
        }

        let mut bmp: BITMAP = std::mem::zeroed();
        let got = GetObjectW(
            hbm_color,
            std::mem::size_of::<BITMAP>() as i32,
            &mut bmp as *mut _ as *mut core::ffi::c_void,
        );
        if got == 0 || bmp.bmWidth <= 0 || bmp.bmHeight <= 0 {
            cleanup(hbm_color, hbm_mask);
            return Err("Could not read icon bitmap dimensions".to_string());
        }
        let width = bmp.bmWidth;
        let height = bmp.bmHeight;

        let hdc = CreateCompatibleDC(std::ptr::null_mut());
        if hdc.is_null() {
            cleanup(hbm_color, hbm_mask);
            return Err("CreateCompatibleDC failed".to_string());
        }

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // negative = top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut buffer = vec![0u8; (width as usize) * (height as usize) * 4];
        let scanlines = GetDIBits(
            hdc,
            hbm_color,
            0,
            height as u32,
            buffer.as_mut_ptr() as *mut core::ffi::c_void,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        DeleteDC(hdc);
        cleanup(hbm_color, hbm_mask);

        if scanlines == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // DIB comes back as BGRA. Swap to RGBA. If every alpha byte is zero the
        // icon carries no alpha channel, so treat it as fully opaque.
        let has_alpha = buffer.chunks_exact(4).any(|px| px[3] != 0);
        for px in buffer.chunks_exact_mut(4) {
            px.swap(0, 2);
            if !has_alpha {
                px[3] = 255;
            }
        }

        let img = image::RgbaImage::from_raw(width as u32, height as u32, buffer)
            .ok_or_else(|| "Malformed icon pixel buffer".to_string())?;
        let mut out = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png)
            .map_err(|e| format!("PNG encode failed: {e}"))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(out.get_ref());
        Ok(format!("data:image/png;base64,{b64}"))
    })();

    unsafe { DestroyIcon(hicon) };
    result
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn extracts_a_real_pe_icon_as_png() {
        // shell32.dll always exists and has hundreds of icons; index 0 is safe.
        let url = extract_exe_icon_data_url(r"C:\Windows\System32\shell32.dll", 0, 32)
            .expect("extraction should succeed for shell32.dll");
        assert!(url.starts_with("data:image/png;base64,"), "wrong data URL prefix");

        let b64 = url.trim_start_matches("data:image/png;base64,");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .expect("valid base64");
        let img = image::load_from_memory(&bytes).expect("valid PNG");
        assert_eq!(img.width(), 32, "expected 32px wide icon");
        assert_eq!(img.height(), 32, "expected 32px tall icon");
    }

    #[test]
    fn bad_index_fails_cleanly() {
        // An absurd index should fail (so the frontend falls back to initials).
        let res = extract_exe_icon_data_url(r"C:\Windows\System32\shell32.dll", 99999, 32);
        assert!(res.is_err(), "expected failure for out-of-range index");
    }
}
