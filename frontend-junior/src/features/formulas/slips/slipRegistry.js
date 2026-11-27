import TabletRmSlip, { getInitialTabletRmData } from './TabletRmSlip'
import TabletPmSlip, { getInitialTabletPmData } from './TabletPmSlip'
import DropsRmSlip, { getInitialDropsRmData } from './DropsRmSlip'
import DropsPmSlip, { getInitialDropsPmData } from './DropsPmSlip'
import OilRmSlip, { getInitialOilRmData } from './OilRmSlip'
import OilPmSlip, { getInitialOilPmData } from './OilPmSlip'
import MotherTinctureRmSlip, { getInitialMotherTinctureRmData } from './MotherTinctureRmSlip'
import SyrupRmSlip, { getInitialSyrupRmData } from './SyrupRmSlip'
import SyrupPmSlip, { getInitialSyrupPmData } from './SyrupPmSlip'
import PlaceholderSlip from './PlaceholderSlip'
import TabletTestRequestBulkSlip, { getInitialTabletTestRequestBulkData } from '../../quality/slips/TabletTestRequestBulkSlip'
import TabletTestRequestFpSlip, { getInitialTabletTestRequestFpData } from '../../quality/slips/TabletTestRequestFpSlip'
import TabletBulkReleaseSlip, { getInitialTabletBulkReleaseData } from '../../quality/slips/TabletBulkReleaseSlip'
import MotherTinctureBulkReleaseSlip, { getInitialMotherTinctureBulkReleaseData } from '../../quality/slips/MotherTinctureBulkReleaseSlip'
import MotherTinctureTestRequestBeforeFilterSlip, { getInitialMotherTinctureTrBeforeFilterData } from '../../quality/slips/MotherTinctureTestRequestBeforeFilterSlip'
import MotherTinctureTestRequestAfterFilterSlip, { getInitialMotherTinctureTrAfterFilterData } from '../../quality/slips/MotherTinctureTestRequestAfterFilterSlip'
import SyrupTestRequestBulkSlip, { getInitialSyrupTestRequestBulkData } from '../../quality/slips/SyrupTestRequestBulkSlip'
import SyrupBulkReleaseSlip, { getInitialSyrupBulkReleaseData } from '../../quality/slips/SyrupBulkReleaseSlip'
import OilTestRequestBulkSlip, { getInitialOilTestRequestBulkData } from '../../quality/slips/OilTestRequestBulkSlip'
import OilBulkReleaseSlip, { getInitialOilBulkReleaseData } from '../../quality/slips/OilBulkReleaseSlip'
import DropsTestRequestBulkSlip, { getInitialDropsTestRequestBulkData } from '../../quality/slips/DropsTestRequestBulkSlip'
import DropsBulkReleaseSlip, { getInitialDropsBulkReleaseData } from '../../quality/slips/DropsBulkReleaseSlip'
import QcPlaceholderSlip from '../../quality/slips/QcPlaceholderSlip'
import { normalizeProductTypeKey, getProductTypeDisplayName } from '../../production/bmrTemplates/index.js'

/**
 * PER-TYPE SLIP REGISTRY:
 * Maps normalized product type / dosage form to its corresponding RM, PM, and QC slips.
 * Adding a new dosage form (e.g. Syrup, Mother Tincture, Drops) later requires only
 * adding one entry here, without touching other types or the generic saving logic.
 */
export const SLIP_REGISTRY = {
  syrup: {
    key: 'syrup',
    label: 'Syrup',
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    rm: {
      title: 'Syrup RM Requisition Slip (Attachment - 1 Master Format)',
      subtitle: 'Exact replica of MASTER_RM_Requistion_ATTACHMENT_1__1_.docx',
      Component: SyrupRmSlip,
      getInitialData: getInitialSyrupRmData,
      isPlaceholder: false,
    },
    pm: {
      title: 'Syrup Packing Material Requirement Slip (Attachment - 4 Master Format)',
      subtitle: 'Exact replica of MASTER__PM_Requistion_ATTACHMENT_4__1_.docx',
      Component: SyrupPmSlip,
      getInitialData: getInitialSyrupPmData,
      isPlaceholder: false,
    },
    testRequestBulk: {
      title: 'Attachment-2 : TEST REQUEST (BULK )',
      code: 'SOP/QA/04/F-03/00',
      Component: SyrupTestRequestBulkSlip,
      getInitialData: getInitialSyrupTestRequestBulkData,
      isPlaceholder: false,
    },
    bulkRelease: {
      title: 'Bulk Release Slip (Attachment-3)',
      code: 'SOP/QC/03/F-02/00',
      Component: SyrupBulkReleaseSlip,
      getInitialData: getInitialSyrupBulkReleaseData,
      isPlaceholder: false,
    },
    testRequestFp: {
      title: 'Attachment-5 : TEST REQUEST (MT/FP )',
      code: 'SOP/QA/04/F-03/00',
      Component: QcPlaceholderSlip,
      isPlaceholder: true,
      customMessage: 'Attachment-5 (Test Request MT/FP) for Syrup will be attached soon.',
    },
  },
  tablet: {
    key: 'tablet',
    label: 'Tablet',
    department: 'PRODUCTION ( TABLET DEPARTMENT)',
    rm: {
      title: 'Tablet RM Requisition Slip (Attachment - 1 Master Format)',
      subtitle: 'Exact replica of MASTER_RM_Requistion_ATTACHMENT_1.docx',
      Component: TabletRmSlip,
      getInitialData: getInitialTabletRmData,
      isPlaceholder: false,
    },
    pm: {
      title: 'Tablet Packing Material Requirement Slip (Attachment - 4 Master Format)',
      subtitle: 'Exact replica of MASTER__PM_Requistion_ATTACHMENT_4.docx',
      Component: TabletPmSlip,
      getInitialData: getInitialTabletPmData,
      isPlaceholder: false,
    },
    testRequestBulk: {
      title: 'Attachment-2 : TEST REQUEST (BULK )',
      code: 'SOP/QA/04/F-03/00',
      Component: TabletTestRequestBulkSlip,
      getInitialData: getInitialTabletTestRequestBulkData,
      isPlaceholder: false,
    },
    bulkRelease: {
      title: 'Attachment-3 : BULK RELEASE SLIP',
      code: 'SOP/QC/03/F-02/00',
      Component: TabletBulkReleaseSlip,
      getInitialData: getInitialTabletBulkReleaseData,
      isPlaceholder: false,
    },
    testRequestFp: {
      title: 'Attachment-5 : TEST REQUEST (MT/FP )',
      code: 'SOP/QA/04/F-03/00',
      Component: TabletTestRequestFpSlip,
      getInitialData: getInitialTabletTestRequestFpData,
      isPlaceholder: false,
    },
  },
  drops: {
    key: 'drops',
    label: 'Drops',
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    rm: {
      title: 'Drops RM Requisition Slip (Attachment - 1 Master Format)',
      subtitle: 'Exact replica of Drops RM Requistion ATTACHMENT 1 MASTER FORMAT.docx',
      Component: DropsRmSlip,
      getInitialData: getInitialDropsRmData,
      isPlaceholder: false,
    },
    pm: {
      title: 'Packing Material Requirement Slip (Attachment - 4 Master Format)',
      subtitle: 'Exact replica of ATTACHMENT 4.docx',
      Component: DropsPmSlip,
      getInitialData: getInitialDropsPmData,
      isPlaceholder: false,
    },
    testRequestBulk: {
      title: 'Attachment-2 : TEST REQUEST (BULK )',
      code: 'SOP/QA/04/F-03/00',
      Component: DropsTestRequestBulkSlip,
      getInitialData: getInitialDropsTestRequestBulkData,
      isPlaceholder: false,
    },
    bulkRelease: {
      title: 'Bulk Release Slip (Attachment-3)',
      code: 'SOP/QC/03/F-02',
      Component: DropsBulkReleaseSlip,
      getInitialData: getInitialDropsBulkReleaseData,
      isPlaceholder: false,
    },
    testRequestFp: {
      title: 'Attachment-5 : TEST REQUEST (MT/FP )',
      code: 'SOP/QA/04/F-03/00',
      Component: QcPlaceholderSlip,
      isPlaceholder: true,
      customMessage: 'Attachment-5 (Test Request MT/FP) for Drops will be attached soon.',
    },
  },
  oil: {
    key: 'oil',
    label: 'Oil',
    department: 'PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)',
    rm: {
      title: 'Oil RM Requisition Slip (Attachment - 1 Master Format)',
      subtitle: 'Exact replica of OIL_RM_Requistion_ATTACHMENT_1.docx',
      Component: OilRmSlip,
      getInitialData: getInitialOilRmData,
      isPlaceholder: false,
    },
    pm: {
      title: 'Packing Material Requirement Slip (Attachment - 4 Master Format)',
      subtitle: 'Exact replica of OIL_PM_Requistion_ATTACHMENT_4.docx',
      Component: OilPmSlip,
      getInitialData: getInitialOilPmData,
      isPlaceholder: false,
    },
    testRequestBulk: {
      title: 'Attachment-2 : TEST REQUEST (BULK )',
      code: 'SOP/QA/04/F-03/00',
      Component: OilTestRequestBulkSlip,
      getInitialData: getInitialOilTestRequestBulkData,
      isPlaceholder: false,
      isGenericOil: true,
    },
    bulkRelease: {
      title: 'Attachment-3 : BULK RELEASE SLIP',
      code: 'SOP/QC/03/F-02/00',
      Component: OilBulkReleaseSlip,
      getInitialData: getInitialOilBulkReleaseData,
      isPlaceholder: false,
      isGenericOil: true,
    },
    testRequestFp: {
      title: 'Attachment-5 : TEST REQUEST (MT/FP )',
      code: 'SOP/QA/04/F-03/00',
      Component: QcPlaceholderSlip,
      isPlaceholder: true,
      customMessage: 'Attachment-5 (Test Request MT/FP) for Oil will be attached soon.',
    },
  },
  'mother-tincture': {
    key: 'mother-tincture',
    label: 'Mother Tincture',
    department: 'DEPARTMENT :  MOTHER TINCTURE',
    rm: {
      title: 'RM Request for Mother Tincture (Attachment 1 Master Format)',
      subtitle: 'Exact replica of ATTACHMENT_1.docx',
      Component: MotherTinctureRmSlip,
      getInitialData: getInitialMotherTinctureRmData,
      isPlaceholder: false,
    },
    pm: {
      title: 'Packing Material Requirement Slip (Attachment - 4)',
      subtitle: 'Attachment - 4 for Mother Tincture',
      Component: PlaceholderSlip,
      getInitialData: () => ({}),
      isPlaceholder: true,
      customMessage: 'PM Slip (Attachment - 4) for Mother Tincture will be attached soon.',
    },
    testRequestBulk: {
      title: 'Attachment-2 : TEST REQUEST FOR BULK BEFORE FILTER',
      code: 'SOP/MT/01/F01-00',
      Component: MotherTinctureTestRequestBeforeFilterSlip,
      getInitialData: getInitialMotherTinctureTrBeforeFilterData,
      isPlaceholder: false,
    },
    bulkRelease: {
      title: 'Bulk Release Slip (Attachment-3)',
      code: 'SOP/QC/04/F-01',
      Component: MotherTinctureBulkReleaseSlip,
      getInitialData: getInitialMotherTinctureBulkReleaseData,
      isPlaceholder: false,
    },
    testRequestFp: {
      title: 'Attachment-4 : TEST REQUEST FOR BULK AFTER FILTER',
      code: 'SOP/MT/01/F01-00',
      Component: MotherTinctureTestRequestAfterFilterSlip,
      getInitialData: getInitialMotherTinctureTrAfterFilterData,
      isPlaceholder: false,
    },
  },
}

/**
 * Resolves slip configuration based on product properties.
 * Uses the exact same detection logic as BMR and COA screens.
 * Never hardcodes by product id or product name.
 * 
 * @param {object} product 
 * @returns {object} { typeKey, displayName, isImplemented, config }
 */
export function resolveSlipConfig(product) {
  const rawType =
    product?.dosage_form ||
    product?.dosageForm ||
    product?.product_type ||
    product?.type ||
    product?.category ||
    ''

  const typeKey = normalizeProductTypeKey(rawType)
  const displayName = getProductTypeDisplayName(rawType)

  if (typeKey && SLIP_REGISTRY[typeKey]) {
    return {
      typeKey,
      displayName,
      isImplemented: true,
      config: SLIP_REGISTRY[typeKey],
    }
  }

  // Fallback for types without slips implemented yet (Syrup, Oil, Mother Tincture, etc.)
  return {
    typeKey: typeKey || 'unknown',
    displayName,
    isImplemented: false,
    config: {
      key: typeKey || 'unknown',
      label: displayName,
      department: `PRODUCTION ( ${displayName.toUpperCase()} DEPARTMENT)`,
      rm: {
        title: `${displayName} RM Requisition Slip (Attachment - 1)`,
        subtitle: `Attachment - 1 for ${displayName}`,
        Component: PlaceholderSlip,
        getInitialData: () => ({}),
        isPlaceholder: true,
      },
      pm: {
        title: `${displayName} Packing Material Requirement Slip (Attachment - 4)`,
        subtitle: `Attachment - 4 for ${displayName}`,
        Component: PlaceholderSlip,
        getInitialData: () => ({}),
        isPlaceholder: true,
      },
      testRequestBulk: {
        title: `${displayName} Test Request Slip (Attachment - 2)`,
        Component: QcPlaceholderSlip,
        isPlaceholder: true,
      },
      bulkRelease: {
        title: `${displayName} Bulk Release Slip (Attachment - 3)`,
        Component: QcPlaceholderSlip,
        isPlaceholder: true,
      },
      testRequestFp: {
        title: `${displayName} Test Request FP Slip (Attachment - 5)`,
        Component: QcPlaceholderSlip,
        isPlaceholder: true,
      },
    },
  }
}

/**
 * Resolves Quality Control slip configuration by slipKind ('testRequestBulk' | 'bulkRelease' | 'testRequestFp')
 * and product type.
 * 
 * @param {string} slipKind - 'testRequestBulk' | 'bulkRelease' | 'testRequestFp'
 * @param {object|string} productOrType
 * @returns {object} { typeKey, displayName, isImplemented, isGenericOil, config }
 */
export function resolveQcSlip(slipKind, productOrType) {
  let rawType = ''
  if (typeof productOrType === 'string') {
    rawType = productOrType
  } else if (productOrType) {
    rawType =
      productOrType.dosage_form ||
      productOrType.dosageForm ||
      productOrType.product_type ||
      productOrType.type ||
      productOrType.category ||
      productOrType.material_name ||
      ''
  }

  const typeKey = normalizeProductTypeKey(rawType) || 'tablet'
  const displayName = getProductTypeDisplayName(typeKey)
  const typeEntry = SLIP_REGISTRY[typeKey]

  if (typeEntry && typeEntry[slipKind] && !typeEntry[slipKind].isPlaceholder) {
    return {
      typeKey,
      displayName,
      isImplemented: true,
      isGenericOil: Boolean(typeEntry[slipKind].isGenericOil),
      config: typeEntry[slipKind],
    }
  }

  return {
    typeKey,
    displayName,
    isImplemented: false,
    isGenericOil: false,
    config: {
      title: `${displayName} QC Slip`,
      Component: QcPlaceholderSlip,
      isPlaceholder: true,
      getInitialData: () => ({}),
      customMessage: typeEntry?.[slipKind]?.customMessage || '',
    },
  }
}
