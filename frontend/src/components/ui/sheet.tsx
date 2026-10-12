import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { MIN_SHEET_WIDTH, useResizableWidth } from "@/hooks/useResizableWidth"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Remembers the width the user drags this sheet to (left/right sheets only).
   * Without it the sheet still resizes, but opens at its default width again.
   */
  resizeKey?: string
  /** Left/right sheets get a drag handle on their inner edge unless this is false. */
  resizable?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, style, resizeKey, resizable = true, ...props }, ref) => {
  const horizontal = side === "left" || side === "right"
  const canResize = resizable && horizontal
  const resize = useResizableWidth({ side: side === "left" ? "left" : "right", storageKey: resizeKey })
  const { attach } = resize
  const setRefs = React.useCallback(
    (node: React.ElementRef<typeof SheetPrimitive.Content> | null) => {
      attach(node)
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref, attach],
  )
  const edge = resize.renderedWidth === null ? undefined : resize.renderedWidth - 4
  // Inline width beats the sheet's own width/max-width classes only once the
  // user has resized; until then each sheet keeps the width it was designed for.
  const sized = canResize && resize.width !== null
    ? { ...style, width: resize.width, maxWidth: "none" }
    : style

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={setRefs}
        className={cn(sheetVariants({ side }), resize.dragging && "select-none", className)}
        style={sized}
        {...props}
      >
        {children}
        {canResize && edge !== undefined && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Paneli genişlet veya daralt"
            aria-valuemin={MIN_SHEET_WIDTH}
            aria-valuenow={resize.width ?? undefined}
            title="Sürükleyerek genişlet veya daralt · çift tıkla: varsayılan genişlik"
            tabIndex={0}
            onPointerDown={resize.onPointerDown}
            onKeyDown={resize.onKeyDown}
            onDoubleClick={resize.reset}
            style={side === "right" ? { right: edge } : { left: edge }}
            className="group fixed inset-y-0 z-[60] flex w-2 cursor-col-resize touch-none justify-center outline-none"
          >
            <span
              className={cn(
                "h-full w-px bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary",
                resize.dragging && "bg-primary",
              )}
            />
          </div>
        )}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Kapat</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
