/**
 * Helpers de sistemas 115 V / 400 Hz (datos Excel), sin pestañas UI.
 * La planta es la cascada única 690 → aguas abajo.
 */

export {
  isMsb4Sfs,
  isMsb4SfsInterconnect,
  isHz400Circuit,
  isScv4Sfs,
  isSbt6Pws,
  isSbtToScvDirectFeed,
  isScvToMsb4SfsFeed,
  msb4SfsTieSide,
} from './hz400'
