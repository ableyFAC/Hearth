-- =============================================================================
-- Hearth — seed reference data
-- Typical-lifespan defaults (power the dashboard) + a few demo contractors so
-- Screen 5 has something to match against locally.
-- =============================================================================

insert into public.system_lifespans (system_type, expected_lifespan_years, label) values
  ('roof',             22, 'Roof'),
  ('hvac',             18, 'HVAC system'),
  ('water_heater',     11, 'Water heater'),
  ('electrical_panel', 35, 'Electrical panel'),
  ('plumbing',         50, 'Plumbing'),
  ('windows',          25, 'Windows'),
  ('foundation',       75, 'Foundation'),
  ('appliance',        12, 'Major appliance')
on conflict (system_type) do update
  set expected_lifespan_years = excluded.expected_lifespan_years,
      label = excluded.label;

-- Demo vetted contractors. Replace with real, verified partners before launch.
insert into public.contractors (name, license_number, categories, service_area, contact_email, contact_phone, vetted, rating) values
  ('Summit Roofing Co.',      'CA-RF-100231', array['roof']::text[],                 'Bay Area, CA',   'leads@summitroofing.example',   '+1-415-555-0142', true, 4.8),
  ('Delta Plumbing & Drain',  'CA-PL-553102', array['plumbing']::text[],             'Bay Area, CA',   'dispatch@deltaplumb.example',   '+1-415-555-0177', true, 4.6),
  ('BrightSpark Electric',    'CA-EL-882014', array['electrical']::text[],           'Bay Area, CA',   'hello@brightspark.example',     '+1-510-555-0190', true, 4.7),
  ('ClimateRight HVAC',       'CA-HV-220985', array['hvac']::text[],                 'Bay Area, CA',   'service@climateright.example',  '+1-650-555-0123', true, 4.5),
  ('Foundation First',        'CA-GC-310777', array['structural']::text[],           'Bay Area, CA',   'info@foundationfirst.example',  '+1-408-555-0156', true, 4.4),
  ('AllTrades Home Services', 'CA-GC-411902', array['roof','plumbing','hvac','electrical','structural','other']::text[], 'Bay Area, CA', 'quotes@alltrades.example', '+1-415-555-0188', true, 4.3)
on conflict do nothing;
